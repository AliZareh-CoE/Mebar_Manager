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
# Restore drill (practice it BEFORE you need it):  deploy/restore.sh
#   It lists backups, lets you pick one, stops the app, swaps the file into the
#   data volume (clearing the WAL), restarts, and verifies. Run it monthly.
#
# Off-site copies (optional): set BACKUP_REMOTE in this script's cron environment
# to push each nightly dump to a second machine or object store. See the README
# "Off-site backups" section. Variables:
#   BACKUP_REMOTE           destination (e.g. s3:my-bucket/mebar, user@host:/srv/mebar)
#   BACKUP_REMOTE_METHOD    optional: rclone | scp | rsync  (auto-detected if unset)
#   BACKUP_REMOTE_KEEP_DAYS optional: prune remote files older than N days (rclone only)
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

# ---- Off-site copy (optional) -------------------------------------------------
# Enabled by setting BACKUP_REMOTE. A remote-push failure is logged but never
# fails the already-successful local backup, so the cron job stays green.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  src="$BACKUP_DIR/mebar-$stamp.db"
  method="${BACKUP_REMOTE_METHOD:-}"

  if [ -z "$method" ]; then
    remote_prefix="${BACKUP_REMOTE%%:*}:"
    if command -v rclone >/dev/null 2>&1 \
       && rclone listremotes 2>/dev/null | grep -qx "$remote_prefix"; then
      method=rclone
    elif command -v rsync >/dev/null 2>&1; then
      method=rsync
    else
      method=scp
    fi
  fi

  set +e
  case "$method" in
    rclone) rclone copy "$src" "$BACKUP_REMOTE" ;;
    rsync)  rsync -az "$src" "$BACKUP_REMOTE/" ;;
    scp)    scp "$src" "$BACKUP_REMOTE/" ;;
    *)      echo "$(date -Is) off-site: unknown BACKUP_REMOTE_METHOD '$method'" >&2; false ;;
  esac
  rc=$?
  set -e

  if [ "$rc" -eq 0 ]; then
    echo "$(date -Is) off-site OK ($method) -> $BACKUP_REMOTE"
  else
    echo "$(date -Is) off-site FAILED ($method rc=$rc) -> $BACKUP_REMOTE" >&2
  fi

  # Optional remote retention (rclone only; best-effort, never fatal).
  if [ "$method" = rclone ] && [ -n "${BACKUP_REMOTE_KEEP_DAYS:-}" ]; then
    rclone delete --min-age "${BACKUP_REMOTE_KEEP_DAYS}d" "$BACKUP_REMOTE" 2>/dev/null || true
  fi
fi
