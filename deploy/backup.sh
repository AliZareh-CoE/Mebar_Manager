#!/usr/bin/env bash
# Nightly SQLite backup with 14-day rotation.
#
# Uses sqlite's online .backup through the app container (safe with WAL —
# no downtime, no torn pages, unlike a raw file copy).
#
# Install (as the deploy user):
#   chmod +x /opt/mebar-manager/deploy/backup.sh
#   crontab -e   →   15 3 * * * /opt/mebar-manager/deploy/backup.sh >> /var/log/mebar-backup.log 2>&1
#
# Restore drill (practice it BEFORE you need it):
#   docker compose -f /opt/mebar-manager/deploy/docker-compose.yml stop app
#   docker run --rm -v mebar-manager_mebar-data:/data -v /opt/mebar-backups:/backups \
#     alpine cp /backups/<pick-one>.db /data/mebar.db
#   docker compose -f /opt/mebar-manager/deploy/docker-compose.yml start app
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/mebar-manager/deploy}"
BACKUP_DIR="${BACKUP_DIR:-/opt/mebar-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"

# Online backup via better-sqlite3 inside the running app container,
# written to the data volume, then copied out.
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T app \
  node -e "require('better-sqlite3')('/app/data/mebar.db').backup('/app/data/backup-tmp.db').then(()=>console.log('backup ok'))"

container_id="$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps -q app)"
docker cp "$container_id:/app/data/backup-tmp.db" "$BACKUP_DIR/mebar-$stamp.db"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T app rm -f /app/data/backup-tmp.db

# Rotate.
find "$BACKUP_DIR" -name "mebar-*.db" -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) backed up to $BACKUP_DIR/mebar-$stamp.db"
