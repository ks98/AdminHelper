#!/usr/bin/env bash
#
# update.sh — backup-first AdminHelper update.
#
# Takes a full backup (incl. the CA crown jewel), pulls the pinned images,
# recreates the stack and waits for it to come back. Alembic migrations run
# automatically on the server's start. On trouble, restore from the backup
# this script just wrote.
#
# Version pinning: set the image tags in .env (SERVER_IMAGE, GATEWAY_IMAGE,
# CA_ISSUER_IMAGE, MONITORING_IMAGE) to the target release; this script only
# pulls + recreates. Leaving them at :latest tracks the newest published image.
#
# Usage (from the repository root):
#   ./scripts/update.sh [--skip-backup] [--with-victoria]

set -euo pipefail

SKIP_BACKUP=0
BACKUP_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --skip-backup) SKIP_BACKUP=1 ;;
        --with-victoria) BACKUP_ARGS+=(--with-victoria) ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
    esac
    shift
done

[ -f docker-compose.yml ] || { echo "FEHLER: aus dem Repo-Root ausfuehren." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "FEHLER: 'docker compose' fehlt." >&2; exit 1; }

if [ "$SKIP_BACKUP" != 1 ]; then
    echo "[update] Backup-first..."
    ./scripts/backup.sh "${BACKUP_ARGS[@]}"
else
    echo "[update] Backup uebersprungen (--skip-backup)."
fi

echo "[update] Ziehe die gepinnten Images..."
docker compose pull

echo "[update] Starte den Stack neu (Alembic-Migration laeuft beim Server-Start)..."
docker compose up -d

echo "[update] Warte auf den Server..."
ATTEMPT=0
until [ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "https://localhost/" 2>/dev/null)" != "000" ]; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -gt 120 ]; then
        echo "FEHLER: Stack nach 120s nicht bereit. Bei Problemen: ./scripts/restore.sh <backup.tar.gz>" >&2
        exit 1
    fi
    sleep 2
done

echo "[update] Fertig. Bei Problemen: ./scripts/restore.sh ./backups/<neuestes>.tar.gz"
