#!/usr/bin/env bash
#
# desktop_e2e_live.sh — live desktop E2E: drive the REAL Tauri app (tauri-driver
# + WebdriverIO) against a REAL backend stack, the way a user would.
#
# It boots the stack in PERMISSIVE mTLS mode (MTLS_ENFORCE=false) so the app can
# reach the API with login (JWT) alone — no client cert needed for the "create"
# flow (enrollment is only required to *start* a tunnel; that is a later step).
# It seeds an admin + a server + an FRP config via the admin API, points an
# ISOLATED app config (XDG_DATA_HOME) at the stack with self-signed certs trusted
# and server mode preselected, then runs the live wdio spec under xvfb.
#
# Hermetic: throwaway secrets, locally-built images, isolated ports/volumes and
# app config dir, full teardown. Needs docker(+compose), openssl, curl, python3,
# node, xvfb-run, WebKitWebDriver, tauri-driver, tauri-cli. SKIPs when any is
# missing. Run: bash scripts/tests/desktop_e2e_live.sh

# ok()/bad() never fail, so the `cond && ok || bad` assertions are deliberate.
# shellcheck disable=SC2015
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$HERE/../.." && pwd)
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
OVERLAY="$HERE/docker-compose.itest.yml"
E2E_DIR="$REPO_ROOT/apps/desktop/e2e"
PROJECT="ah-e2e-$$"
IMG_PREFIX="adminhelper-itest"

HTTPS_PORT=$(( 21000 + ($$ % 18000) ))
ENROLL_PORT=$(( HTTPS_PORT + 1 ))
SERVER_URL="https://localhost:$HTTPS_PORT"

PASS=0
FAIL=0
ok()  { echo "  ok   $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }

for bin in docker openssl curl python3 node xvfb-run WebKitWebDriver tauri-driver \
           dbus-run-session gnome-keyring-daemon; do
    command -v "$bin" >/dev/null 2>&1 || { echo "SKIP: '$bin' not available"; exit 0; }
done
docker compose version >/dev/null 2>&1 || { echo "SKIP: docker compose v2 missing"; exit 0; }
docker info >/dev/null 2>&1 || { echo "SKIP: docker daemon not reachable"; exit 0; }
( cd "$REPO_ROOT/apps/desktop/src-tauri" && cargo tauri --version >/dev/null 2>&1 ) \
    || { echo "SKIP: tauri-cli (cargo tauri) not available"; exit 0; }

WORK=$(mktemp -d)
XDG_DATA_HOME="$WORK/xdg-data"
export XDG_DATA_HOME
APP_DATA_DIR="$XDG_DATA_HOME/com.adminhelper.app"

dc() {
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERLAY" \
        --project-directory "$WORK" --env-file "$WORK/.env" "$@"
}

cleanup() {
    dc down -v --remove-orphans >/dev/null 2>&1 || true
    pkill -9 -f tauri-driver >/dev/null 2>&1 || true
    pkill -9 -f "target/debug/adminhelper" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

rand() { openssl rand -hex 16; }
ADMIN_PW="e2e-$(rand)"

cat > "$WORK/.env" <<EOF
DOMAIN=localhost
SECRET_KEY=$(rand)$(rand)
POSTGRES_PASSWORD=$(rand)
CA_ROOT_PASSPHRASE=$(rand)
MONITOR_API_KEY=$(rand)
ADMIN_PASSWORD=$ADMIN_PW
MTLS_ENFORCE=false
SERVER_IMAGE=$IMG_PREFIX/server:latest
GATEWAY_IMAGE=$IMG_PREFIX/gateway:latest
CA_ISSUER_IMAGE=$IMG_PREFIX/ca-issuer:latest
ITEST_HTTPS_PORT=$HTTPS_PORT
ITEST_ENROLL_PORT=$ENROLL_PORT
EOF

# ── Build images (reused across runs via the layer cache) ────────────────────
echo "[e2e-live] building backend images..."
docker build -q -t "$IMG_PREFIX/server:latest"    -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT" >/dev/null \
    || { bad "server image build"; exit 1; }
docker build -q -t "$IMG_PREFIX/gateway:latest"   "$REPO_ROOT/apps/gateway"   >/dev/null \
    || { bad "gateway image build"; exit 1; }
docker build -q -t "$IMG_PREFIX/ca-issuer:latest" "$REPO_ROOT/apps/ca-issuer" >/dev/null \
    || { bad "ca-issuer image build"; exit 1; }

# ── Boot the stack (permissive) ──────────────────────────────────────────────
echo "[e2e-live] starting stack (permissive mTLS) on :$HTTPS_PORT..."
dc up -d gateway >/dev/null 2>&1 || { bad "compose up"; exit 1; }

ready=0
for _ in $(seq 1 90); do
    code=$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 3 "$SERVER_URL/" 2>/dev/null || echo 000)
    [ "$code" != "000" ] && { ready=1; break; }
    sleep 2
done
[ "$ready" = 1 ] && ok "gateway live on :$HTTPS_PORT" || { bad "gateway never came up"; dc logs --tail 40 gateway; exit 1; }

# ── Seed admin login + a server + an FRP config via the admin API ────────────
SEED_JSON=$(python3 - "$SERVER_URL" admin "$ADMIN_PW" <<'PY' 2>/dev/null
import json, ssl, sys, urllib.request

base, user, pw = sys.argv[1], sys.argv[2], sys.argv[3]
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return json.load(r)

# Retry login until the startup lifespan has created the admin from ADMIN_PASSWORD.
token = None
import time
for _ in range(30):
    try:
        token = call("POST", "/api/auth/login", body={"username": user, "password": pw})["access_token"]
        break
    except Exception:
        time.sleep(2)
if not token:
    print("{}"); sys.exit(1)

server = call("POST", "/api/servers", token, {"name": "e2e-server", "hostname": "e2e.local"})
cfg = call("POST", "/api/frp/server-config", token,
           {"name": "e2e-frps", "server_addr": "localhost", "bind_port": 7000})
print(json.dumps({"server_id": server["id"], "server_name": server["name"],
                  "config_id": cfg["id"], "config_name": cfg["name"]}))
PY
)
[ -n "$SEED_JSON" ] && [ "$SEED_JSON" != "{}" ] && ok "seeded admin + server + FRP config" \
    || { bad "seeding via admin API failed"; dc logs --tail 40 server; exit 1; }

AH_SERVER_ID=$(printf '%s' "$SEED_JSON"   | python3 -c 'import sys,json;print(json.load(sys.stdin)["server_id"])')
AH_SERVER_NAME=$(printf '%s' "$SEED_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["server_name"])')
AH_CONFIG_NAME=$(printf '%s' "$SEED_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin)["config_name"])')

# ── Isolated app config: server mode + trust the stack's self-signed cert ─────
mkdir -p "$APP_DATA_DIR"
cat > "$APP_DATA_DIR/settings.json" <<EOF
{"mode": "server", "allowSelfSignedCerts": true}
EOF

# ── Drive the GUI ────────────────────────────────────────────────────────────
echo "[e2e-live] running the live wdio spec under xvfb..."
export AH_SERVER_URL="$SERVER_URL"
export AH_ADMIN_USER="admin"
export AH_ADMIN_PASS="$ADMIN_PW"
export AH_SERVER_ID AH_SERVER_NAME AH_CONFIG_NAME E2E_DIR
SPEC="${AH_SPEC:-test/specs/tunnel-create.live.js}"; export SPEC

# Run under a FRESH D-Bus session with an empty, unlocked gnome-keyring so the
# app sees a CLEAN keyring. The developer's real keyring (system-wide service
# "com.adminhelper.app") may hold an enrolled identity whose pinned CA rejects
# this throwaway stack's gateway cert — making is_enrolled() true and the login
# fail with a CA-pin/MITM error. A fresh secret-service makes is_enrolled() false
# (TOFU login) and is also where enrollment will store the cert (increment 2).
dbus-run-session -- bash -c '
    eval "$(printf "\n" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)" || true
    export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
    cd "$E2E_DIR" && xvfb-run -a npx wdio run wdio.conf.js --spec "$SPEC"
' && ok "live GUI spec (login → create tunnel) passed" \
  || bad "live GUI spec failed"

# ── Independent server-side check: the tunnel really persisted ───────────────
COUNT=$(python3 - "$SERVER_URL" admin "$ADMIN_PW" "$AH_SERVER_ID" <<'PY' 2>/dev/null
import json, ssl, sys, urllib.request
base, user, pw, server_id = sys.argv[1:5]
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    if token: req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return json.load(r)
token = call("POST", "/api/auth/login", body={"username": user, "password": pw})["access_token"]
tunnels = call("GET", "/api/frp/tunnels", token)
print(sum(1 for t in tunnels if t.get("serverId") == server_id or t.get("server_id") == server_id))
PY
)
[ "${COUNT:-0}" -ge 1 ] && ok "tunnel persisted on the server (count=$COUNT)" \
    || bad "no tunnel found on the server for the seeded server (count=${COUNT:-0})"

echo ""
echo "desktop_e2e_live: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
