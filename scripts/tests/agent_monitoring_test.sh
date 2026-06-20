#!/usr/bin/env bash
#
# agent_monitoring_test.sh — real Go agents enroll against the test stack and
# push metrics into the monitoring service. Proves the full provision → enroll
# (mTLS) → push pipeline (until now only unit-tested) and seeds real monitoring
# data for several servers, which the monitoring-check GUI E2E builds on.
#
# Each agent runs in a throwaway debian container (the agent writes its identity
# to the hardcoded /etc/adminhelper, so a container keeps it off the host) on the
# compose network, reaching the gateway by service name. Boot/seed/teardown are
# shared via lib_e2e_stack.sh. Run: bash scripts/tests/agent_monitoring_test.sh

# shellcheck disable=SC2015
set -uo pipefail

# shellcheck source=scripts/tests/lib_e2e_stack.sh
. "$(cd "$(dirname "$0")" && pwd)/lib_e2e_stack.sh"

AGENT_BIN="$E2E_REPO_ROOT/apps/agent/bin/adminhelper-agent"
AGENTS="${AH_AGENTS:-2}"

PASS=0
FAIL=0
ok()  { echo "  ok   $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }

e2e_require docker go

echo "[agent] building the linux agent..."
( cd "$E2E_REPO_ROOT/apps/agent" && make build-linux >/dev/null 2>&1 ) && [ -x "$AGENT_BIN" ] \
    && ok "agent built" || { bad "agent build failed"; exit 1; }

e2e_init false
e2e_up gateway monitoring \
    && ok "gateway + monitoring live on :$E2E_HTTPS_PORT" \
    || { bad "stack never came up"; e2e_dc logs --tail 30 monitoring; exit 1; }

TOKEN=$(e2e_admin_token)
[ -n "$TOKEN" ] && ok "admin login" || { bad "admin login failed"; exit 1; }

# The agent runs on the host network and reaches the gateway via localhost:<port>
# — the test gateway cert is valid for "localhost", so TOFU-pin + verify (and the
# later mTLS push) succeed; a docker service name like "gateway" would not match.
AGENT_URL="https://localhost:$E2E_HTTPS_PORT"
for i in $(seq 1 "$AGENTS"); do
    SID=$(e2e_api "$TOKEN" server "agent-srv-$i" "a$i.local")
    PTOK=$(e2e_api "$TOKEN" provision-token "$SID")
    [ -n "$SID" ] && [ -n "$PTOK" ] || { bad "seed/token for agent $i"; continue; }
    echo "[agent $i] provision + push (server $SID)..."
    docker run --rm --network host -v "$AGENT_BIN:/agent:ro" debian:bookworm-slim \
        sh -c "/agent provision --url '$AGENT_URL' --token '$PTOK' --server-id '$SID' --insecure; /agent run --once" \
        > "$E2E_WORK/agent-$i.log" 2>&1
    if grep -q "mTLS-Client-Zertifikat enrollt" "$E2E_WORK/agent-$i.log" \
        && grep -q "Report gesendet" "$E2E_WORK/agent-$i.log"; then
        ok "agent $i enrolled (mTLS) + pushed a report"
    else
        bad "agent $i did not enroll + push"; sed 's/^/    /' "$E2E_WORK/agent-$i.log"
    fi
done

# Cross-check from the other side: the monitoring service logged the ingestion of
# at least one report per agent (proxied by the server over the 443 data plane).
REPORTS=$(e2e_dc logs monitoring 2>/dev/null | grep -cE "POST /agent/[^/]+/report HTTP")
[ "$REPORTS" -ge "$AGENTS" ] \
    && ok "monitoring ingested $REPORTS agent report(s)" \
    || { bad "monitoring saw $REPORTS reports (expected >= $AGENTS)"; e2e_dc logs --tail 15 monitoring; }

echo ""
echo "agent_monitoring: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
