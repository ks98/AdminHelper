#!/usr/bin/env bash
#
# desktop_e2e_connect.sh — live desktop E2E: open a connection through the GUI to
# a REAL target container and verify the target received the connection. The
# desktop launches ssh/xfreerdp3/the browser as an EXTERNAL process (not in the
# webview), so the assertion is the target container's log (like the tunnel test
# checks the frps log), not GUI state.
#
# This file covers the DIRECT SSH journey; web/rdp and the over-tunnel variants
# build on the same pattern. Shared boot/seed/teardown via lib_e2e_stack.sh.
# Run: bash scripts/tests/desktop_e2e_connect.sh

# shellcheck disable=SC2015
set -uo pipefail

# shellcheck source=scripts/tests/lib_e2e_stack.sh
. "$(cd "$(dirname "$0")" && pwd)/lib_e2e_stack.sh"

E2E_DIR="$E2E_REPO_ROOT/apps/desktop/e2e"
SSH_IMAGE="lscr.io/linuxserver/openssh-server:latest"

PASS=0
FAIL=0
ok()  { echo "  ok   $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }

TARGETS=()
cleanup_targets() { for c in "${TARGETS[@]:-}"; do [ -n "$c" ] && docker rm -f "$c" >/dev/null 2>&1; done; }

wait_log() {  # container pattern timeout — readiness via the log, so we don't
    # pollute the target with a host-side probe (which would look like a client).
    for _ in $(seq 1 "$3"); do docker logs "$1" 2>&1 | grep -qE "$2" && return 0; sleep 1; done
    return 1
}

e2e_require node xvfb-run WebKitWebDriver tauri-driver dbus-run-session gnome-keyring-daemon docker
( cd "$E2E_REPO_ROOT/apps/desktop/src-tauri" && cargo tauri --version >/dev/null 2>&1 ) \
    || { echo "SKIP: tauri-cli (cargo tauri) not available"; exit 0; }

e2e_init false
# Chain target cleanup in front of the lib's compose teardown (don't replace it).
trap 'cleanup_targets; e2e_teardown' EXIT
e2e_up gateway && ok "gateway live on :$E2E_HTTPS_PORT" || { bad "gateway never came up"; exit 1; }

TOKEN=$(e2e_admin_token)
[ -n "$TOKEN" ] && ok "admin login" || { bad "admin login failed"; exit 1; }
e2e_api "$TOKEN" server e2e-server e2e.local >/dev/null || { bad "seed server"; exit 1; }

# ── SSH target + a direct SSH connection ─────────────────────────────────────
SSH_C="ah-e2e-ssh-$$"
docker run -d --name "$SSH_C" -p 2222:2222 \
    -e PASSWORD_ACCESS=true -e USER_NAME=e2e -e USER_PASSWORD=e2e -e LOG_STDOUT=true \
    "$SSH_IMAGE" >/dev/null 2>&1
TARGETS+=("$SSH_C")
wait_log "$SSH_C" "listening on port 2222" 40 && ok "SSH target listening on :2222" || { bad "SSH target never came up"; docker logs --tail 20 "$SSH_C"; exit 1; }
e2e_api "$TOKEN" connection ssh-direct ssh 127.0.0.1 2222 e2e >/dev/null && ok "seeded direct SSH connection" || { bad "seed SSH connection"; exit 1; }

XDG_DATA_HOME="$E2E_WORK/xdg-data"; export XDG_DATA_HOME
mkdir -p "$XDG_DATA_HOME/com.adminhelper.app"
echo '{"mode": "server", "allowSelfSignedCerts": true}' > "$XDG_DATA_HOME/com.adminhelper.app/settings.json"

echo "[connect] driving the SSH-open spec under xvfb..."
export AH_SERVER_URL="$E2E_SERVER_URL" AH_ADMIN_USER="admin" AH_ADMIN_PASS="$E2E_ADMIN_PW" E2E_DIR
dbus-run-session -- bash -c '
    eval "$(printf "\n" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)" || true
    export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
    cd "$E2E_DIR" && xvfb-run -a npx wdio run wdio.conf.js --spec test/specs/ssh-connect.live.js
' && ok "SSH-open GUI spec ran" || bad "SSH-open GUI spec failed"

# Verify from the target side: sshd logged an incoming connection from the
# desktop. The desktop reaches the published port via the docker bridge, so it
# appears as a private (non-loopback) source — distinct from the image's own
# loopback (::1) self-test.
sleep 2
if docker logs "$SSH_C" 2>&1 | grep -E "Connection (closed by|from|received)|Accepted" | grep -qE "172\.|10\.|192\.168\."; then
    ok "sshd logged the desktop's SSH connection (direct)"
else
    bad "sshd saw no connection from the desktop"
    docker logs --tail 25 "$SSH_C"
fi

echo ""
echo "desktop_e2e_connect: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
