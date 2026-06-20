#!/usr/bin/env bash
#
# desktop_e2e_connect_tunnel.sh — full end-to-end SSH OVER an FRP tunnel: the
# desktop opens an SSH connection that resolves through an STCP tunnel to a real
# sshd. Exercises the whole path: desktop frpc visitor → frps → agent frpc server
# → sshd. Verified at the (dedicated) sshd container.
#
# Combines: the tunnel-start machinery (frps + device enrollment + the desktop's
# auto-started visitor), the agent provision (writes the frpc server config), a
# real frpc running that config as the STCP server, and a real openssh target.
# Shared boot/seed/teardown via lib_e2e_stack.sh.
# Run: bash scripts/tests/desktop_e2e_connect_tunnel.sh

# shellcheck disable=SC2015
set -uo pipefail

# shellcheck source=scripts/tests/lib_e2e_stack.sh
. "$(cd "$(dirname "$0")" && pwd)/lib_e2e_stack.sh"

E2E_DIR="$E2E_REPO_ROOT/apps/desktop/e2e"
AGENT_BIN="$E2E_REPO_ROOT/apps/agent/bin/adminhelper-agent"
SSH_IMAGE="lscr.io/linuxserver/openssh-server:latest"
FRPC_IMAGE="snowdreamtech/frpc:0.69.1"

PASS=0
FAIL=0
ok()  { echo "  ok   $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }

TARGETS=()
FRP_VOL=""
ID_VOL=""
cleanup_extra() {
    for c in "${TARGETS[@]:-}"; do [ -n "$c" ] && docker rm -f "$c" >/dev/null 2>&1; done
    [ -n "$FRP_VOL" ] && docker volume rm "$FRP_VOL" >/dev/null 2>&1
    [ -n "$ID_VOL" ] && docker volume rm "$ID_VOL" >/dev/null 2>&1
}
wait_log() { for _ in $(seq 1 "$3"); do docker logs "$1" 2>&1 | grep -qE "$2" && return 0; sleep 1; done; return 1; }

e2e_require node xvfb-run WebKitWebDriver tauri-driver dbus-run-session gnome-keyring-daemon docker go
( cd "$E2E_REPO_ROOT/apps/desktop/src-tauri" && cargo tauri --version >/dev/null 2>&1 ) \
    || { echo "SKIP: tauri-cli (cargo tauri) not available"; exit 0; }

echo "[tun] building the linux agent..."
( cd "$E2E_REPO_ROOT/apps/agent" && make build-linux >/dev/null 2>&1 ) && [ -x "$AGENT_BIN" ] \
    && ok "agent built" || { bad "agent build failed"; exit 1; }

e2e_init false
trap 'cleanup_extra; e2e_teardown' EXIT
e2e_up gateway && ok "gateway live on :$E2E_HTTPS_PORT" || { bad "gateway never came up"; exit 1; }

TOKEN=$(e2e_admin_token)
[ -n "$TOKEN" ] && ok "admin login" || { bad "admin login failed"; exit 1; }
SERVER_ID=$(e2e_api "$TOKEN" server e2e-server e2e.local)    || { bad "seed server"; exit 1; }
CONFIG_ID=$(e2e_api "$TOKEN" config e2e-frps localhost 7000) || { bad "seed FRP config"; exit 1; }

# Dedicated SSH target (a clean log: any connection here came through the tunnel).
SSH_C="ah-e2e-tssh-$$"
docker run -d --name "$SSH_C" -p 2222:2222 \
    -e PASSWORD_ACCESS=true -e USER_NAME=e2e -e USER_PASSWORD=e2e -e LOG_STDOUT=true \
    "$SSH_IMAGE" >/dev/null 2>&1
TARGETS+=("$SSH_C")
wait_log "$SSH_C" "listening on port 2222" 40 && ok "SSH target up on :2222" || { bad "SSH target never came up"; docker logs --tail 20 "$SSH_C"; exit 1; }

# An SSH connection + an STCP tunnel LINKED to it (local_port 2222 -> the SSH
# container; the desktop resolves the connection through this tunnel).
CONN_ID=$(e2e_api "$TOKEN" connection ssh-tunnel ssh 127.0.0.1 22 e2e) || { bad "seed connection"; exit 1; }
e2e_api "$TOKEN" tunnel-conn "$SERVER_ID" "$CONFIG_ID" e2e-ssh-tun 2222 ssh "$CONN_ID" >/dev/null \
    && ok "seeded SSH connection + linked STCP tunnel" || { bad "seed tunnel"; exit 1; }

# frps reads the frps.toml the config wrote into the shared volume.
e2e_dc up -d frps >/dev/null 2>&1 && ok "frps started" || { bad "frps failed"; e2e_dc logs --tail 30 frps; exit 1; }

# Provision an agent WITH FRP -> writes /etc/frp/frpc.toml + tunnel PKI to a volume.
# Two volumes: /etc/frp (frpc.toml) and /etc/adminhelper (the enrolled mTLS
# identity the frpc.toml references for its TLS to frps) — both shared with the
# frpc container below.
FRP_VOL="ah-e2e-frp-$$"; ID_VOL="ah-e2e-id-$$"
docker volume create "$FRP_VOL" >/dev/null; docker volume create "$ID_VOL" >/dev/null
PTOK=$(e2e_api "$TOKEN" provision-token "$SERVER_ID")
docker run --rm --network host -v "$AGENT_BIN:/agent:ro" -v "$FRP_VOL:/etc/frp" -v "$ID_VOL:/etc/adminhelper" debian:bookworm-slim \
    sh -c "/agent provision --url 'https://localhost:$E2E_HTTPS_PORT' --token '$PTOK' --server-id '$SERVER_ID' --insecure" \
    > "$E2E_WORK/agent-prov.log" 2>&1
grep -q "frpc.toml geschrieben" "$E2E_WORK/agent-prov.log" \
    && ok "agent wrote the frpc.toml (STCP server config)" \
    || { bad "agent did not write frpc.toml"; sed 's/^/    /' "$E2E_WORK/agent-prov.log"; exit 1; }

# Run that frpc config as the STCP SERVER (exposes the SSH container via frps).
FRPC_C="ah-e2e-frpc-$$"
# No `-c` arg: the snowdreamtech/frpc image already defaults to
# `frpc -c /etc/frp/frpc.toml`, and its su-exec entrypoint mangles extra args.
docker run -d --name "$FRPC_C" --network host -v "$FRP_VOL:/etc/frp" -v "$ID_VOL:/etc/adminhelper" \
    "$FRPC_IMAGE" >/dev/null 2>&1
TARGETS+=("$FRPC_C")
sleep 4
if e2e_dc logs frps 2>/dev/null | grep -qiE "new proxy|start proxy success|stcp"; then
    ok "agent frpc registered the STCP server with frps"
else
    bad "agent frpc did not register with frps"
    echo "    frpc log:"; docker logs --tail 15 "$FRPC_C" 2>&1 | sed 's/^/    /'
    echo "    frps log:"; e2e_dc logs --tail 15 frps 2>&1 | sed 's/^/    /'
fi

# Device enrollment token (redeemed by the app over the certless :8444 plane).
ENROLL_TOKEN=$(e2e_dc exec -T server python -m app.cli mint-enroll-token --username admin 2>/dev/null | tr -d '\r\n')
[ -n "$ENROLL_TOKEN" ] && ok "minted enrollment token" || { bad "could not mint enrollment token"; exit 1; }

XDG_DATA_HOME="$E2E_WORK/xdg-data"; export XDG_DATA_HOME
mkdir -p "$XDG_DATA_HOME/com.adminhelper.app"
echo '{"mode": "server", "allowSelfSignedCerts": true}' > "$XDG_DATA_HOME/com.adminhelper.app/settings.json"

echo "[tun] driving enroll → login → tunnel → ssh-through-tunnel under xvfb..."
export AH_SERVER_URL="$E2E_SERVER_URL" AH_ADMIN_USER="admin" AH_ADMIN_PASS="$E2E_ADMIN_PW" \
       AH_ENROLL_TOKEN="$ENROLL_TOKEN" E2E_DIR
dbus-run-session -- bash -c '
    eval "$(printf "\n" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)" || true
    export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
    cd "$E2E_DIR" && xvfb-run -a npx wdio run wdio.conf.js --spec test/specs/ssh-tunnel-connect.live.js
' && ok "GUI: enrolled, tunnel connected, opened ssh over the tunnel" || bad "GUI tunnel-connect spec failed"

# Verify at the target: sshd saw the connection that traversed the tunnel.
sleep 2
if docker logs "$SSH_C" 2>&1 | grep -E "Connection (closed by|from|received)|Accepted" | grep -qE "127\.|172\.|10\.|192\.168\."; then
    ok "sshd logged the SSH connection over the tunnel"
else
    bad "sshd saw no tunneled connection"
    docker logs --tail 25 "$SSH_C"
fi

echo ""
echo "desktop_e2e_connect_tunnel: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
