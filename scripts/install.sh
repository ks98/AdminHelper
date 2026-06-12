#!/usr/bin/env bash
#
# install.sh — one-shot AdminHelper install.
#
# Brings up the stack, creates the first admin + a one-time enrollment token
# out-of-band (via the in-container management CLI), then arms enforced mTLS.
# This is what makes enforced-by-default safe: the first admin cannot obtain a
# client cert through the cert-gated :443 login (no admin -> no token -> no cert
# -> can't reach :443), so the installer — running on the host with internal
# docker-network access — mints that first token directly.
#
# Usage (from the repository root):
#   ./scripts/install.sh [--domain D] [--admin-user U] [--admin-password P]
#                        [--enroll-ttl-minutes N] [--no-enforce] [--yes]
#
# Missing --domain / --admin-password are prompted for. The admin password is
# hashed in the DB and never written to .env.

set -euo pipefail

DOMAIN=""
ADMIN_USER="admin"
ADMIN_PASSWORD=""
ENROLL_TTL=60
ARM=1
ASSUME_YES=0

while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="${2:?--domain needs a value}"; shift ;;
        --admin-user) ADMIN_USER="${2:?--admin-user needs a value}"; shift ;;
        --admin-password) ADMIN_PASSWORD="${2:?--admin-password needs a value}"; shift ;;
        --enroll-ttl-minutes) ENROLL_TTL="${2:?needs a value}"; shift ;;
        --no-enforce) ARM=0 ;;
        --yes|-y) ASSUME_YES=1 ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
    esac
    shift
done

# --- Preflight --------------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "FEHLER: docker fehlt." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "FEHLER: 'docker compose' fehlt." >&2; exit 1; }
[ -f docker-compose.yml ] || { echo "FEHLER: aus dem Repo-Root ausfuehren." >&2; exit 1; }

# Set or replace KEY=VALUE in .env (handles commented-out lines).
upsert_env() {
    local key="$1" value="$2"
    if grep -qE "^#?[[:space:]]*${key}=" .env; then
        local tmp; tmp=$(mktemp)
        sed -E "s|^#?[[:space:]]*${key}=.*|${key}=${value}|" .env > "$tmp"
        mv "$tmp" .env
    else
        printf '%s=%s\n' "$key" "$value" >> .env
    fi
}

# --- Secrets + .env ---------------------------------------------------------
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[install] .env aus .env.example erstellt."
fi
./scripts/init-secrets.sh

[ -n "$DOMAIN" ] || read -rp "Domain (z.B. srm.example.com) [localhost]: " DOMAIN
DOMAIN="${DOMAIN:-localhost}"
if [ -z "$ADMIN_PASSWORD" ]; then
    read -rsp "Admin-Passwort (min. 8 Zeichen): " ADMIN_PASSWORD; echo
fi
[ "${#ADMIN_PASSWORD}" -ge 8 ] || { echo "FEHLER: Passwort < 8 Zeichen." >&2; exit 1; }

# DOMAIN must be set BEFORE the first boot: the ca-issuer mints the gateway TLS
# leaf with DOMAIN as its SAN.
upsert_env DOMAIN "$DOMAIN"
# Start permissive so the bootstrap below can run; armed at the end.
upsert_env MTLS_ENFORCE "false"
chmod 600 .env 2>/dev/null || true

if [ "$ASSUME_YES" != 1 ]; then
    echo "[install] Domain=$DOMAIN  Admin=$ADMIN_USER  Enforce=$([ "$ARM" = 1 ] && echo ja || echo nein)"
    printf "Fortfahren? [y/N] "; read -r a; case "$a" in y|Y|j|J) ;; *) echo Abgebrochen.; exit 0 ;; esac
fi

# --- Stack hoch -------------------------------------------------------------
echo "[install] Starte den Stack..."
docker compose up -d

echo "[install] Warte auf den Server (Migration + Gateway)..."
ATTEMPT=0
until [ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "https://localhost/" 2>/dev/null)" != "000" ]; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -gt 120 ]; then echo "FEHLER: Stack nach 120s nicht bereit." >&2; exit 1; fi
    sleep 2
done
echo "[install] Stack bereit."

# --- Erst-Admin + Enroll-Token (out-of-band, via Container-CLI) -------------
docker compose exec -T server python -m app.cli create-admin \
    --username "$ADMIN_USER" --password "$ADMIN_PASSWORD"
ENROLL_TOKEN=$(docker compose exec -T server python -m app.cli mint-enroll-token \
    --username "$ADMIN_USER" --ttl-minutes "$ENROLL_TTL" | tr -d '\r')

# --- Scharfschalten ---------------------------------------------------------
if [ "$ARM" = 1 ]; then
    echo "[install] Schalte mTLS scharf (MTLS_ENFORCE=true)..."
    upsert_env MTLS_ENFORCE "true"
    docker compose up -d --force-recreate gateway server >/dev/null
fi

# --- Zusammenfassung --------------------------------------------------------
cat <<EOF

============================================================================
  AdminHelper laeuft auf https://${DOMAIN}/   $([ "$ARM" = 1 ] && echo '(mTLS erzwungen)' || echo '(mTLS permissiv)')

  Admin-Login:    ${ADMIN_USER} / ${ADMIN_PASSWORD}

  Desktop-Cert:   Desktop oeffnen -> "Mit Token enrollen" -> Server-URL + Token:
                  ${ENROLL_TOKEN}
                  (einmalig, ${ENROLL_TTL} Min gueltig; danach Login + optional
                   Browser-.p12 ueber den Export-Knopf im Desktop)
============================================================================
EOF
