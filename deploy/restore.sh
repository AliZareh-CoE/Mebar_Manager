#!/bin/sh
# Guided restore drill for Mebar Manager.
#
# Practice this MONTHLY on a staging copy — a backup you have never restored is
# a backup you do not have.
#
# Usage:
#   deploy/restore.sh                 # pick from /opt/mebar-backups interactively
#   deploy/restore.sh /path/to.db     # restore an explicit file (e.g. pulled off-site)
#   deploy/restore.sh /path/to.db.gz  # gzipped copies are decompressed automatically
#   FORCE=1 deploy/restore.sh <file>  # skip the typed confirmation (automation)
#
# Env overrides: COMPOSE_DIR (default /opt/mebar-manager/deploy),
#                BACKUP_DIR   (default /opt/mebar-backups)
set -eu

COMPOSE_DIR="${COMPOSE_DIR:-/opt/mebar-manager/deploy}"
BACKUP_DIR="${BACKUP_DIR:-/opt/mebar-backups}"
COMPOSE="docker compose -f $COMPOSE_DIR/docker-compose.yml"

log() { echo "$(date -Is) restore: $*"; }
die() { echo "$(date -Is) restore: ERROR $*" >&2; exit 1; }

# 1. Choose the source file --------------------------------------------------
if [ "${1:-}" != "" ]; then
  src="$1"
  [ -f "$src" ] || die "no such file: $src"
else
  set --
  for f in $(ls -1t "$BACKUP_DIR"/mebar-*.db "$BACKUP_DIR"/mebar-*.db.gz 2>/dev/null); do
    set -- "$@" "$f"
  done
  [ "$#" -gt 0 ] || die "no backups in $BACKUP_DIR (pass a file path as an argument)"
  echo "Available backups (newest first):"
  i=1
  for f in "$@"; do
    printf '  %2d) %s\n' "$i" "$f"
    i=$((i + 1))
  done
  printf 'Pick a number [1]: '
  read -r pick
  pick="${pick:-1}"
  # Reject 0 explicitly: ${0} is the script's own path and would "restore"
  # this shell script over the live database. Bound to the listed count.
  case "$pick" in ''|*[!0-9]*) die "not a number: $pick" ;; esac
  [ "$pick" -ge 1 ] && [ "$pick" -le "$#" ] || die "out of range (1-$#): $pick"
  eval "src=\${$pick:-}"
  [ -n "${src:-}" ] && [ -f "$src" ] || die "invalid selection: $pick"
fi
log "selected $src"

# 2. Decompress if gzipped ---------------------------------------------------
work="$src"
tmp=""
case "$src" in
  *.gz)
    tmp="$(mktemp)"
    log "gunzip -> $tmp"
    gunzip -c "$src" > "$tmp"
    work="$tmp"
    ;;
esac

# 3. Quick integrity check (best-effort; the app image is the authority) -----
if command -v sqlite3 >/dev/null 2>&1; then
  res="$(sqlite3 "$work" 'PRAGMA integrity_check;' 2>&1 | head -1)"
  [ "$res" = "ok" ] || die "integrity check failed on $src: $res"
  log "integrity_check ok"
fi

# 4. Confirm -----------------------------------------------------------------
if [ "${FORCE:-}" != "1" ]; then
  printf 'This REPLACES the live database with %s. Type "restore" to proceed: ' "$src"
  read -r confirm
  [ "$confirm" = "restore" ] || die "aborted"
fi

# 5. Resolve the real data-volume name from the running app container --------
# shellcheck disable=SC2086
cid="$($COMPOSE ps -q app || true)"
[ -n "$cid" ] || die "app container not found — is the stack up? ($COMPOSE up -d)"
volume="$(docker inspect -f \
  '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Name }}{{ end }}{{ end }}' \
  "$cid")"
[ -n "$volume" ] || die "could not resolve the /app/data volume from container $cid"
log "data volume = $volume"

# 6. Stop the app (only the app opens the DB; Caddy keeps running) -----------
log "stopping app"
# shellcheck disable=SC2086
$COMPOSE stop app

# 7. Snapshot the CURRENT live DB first — the undo button ---------------------
# A restore that picks the wrong file must be recoverable. The pre-restore
# snapshot lands in BACKUP_DIR; roll back by re-running restore.sh on it.
mkdir -p "$BACKUP_DIR"
prestamp="$(date +%Y%m%d-%H%M%S)"
log "snapshotting current live DB -> $BACKUP_DIR/pre-restore-$prestamp.db"
# The WAL/SHM sidecars ride along: if the app didn't close cleanly, the WAL
# still holds un-checkpointed writes — a .db-only copy would silently drop them.
docker run --rm \
  -v "$volume":/data \
  -v "$BACKUP_DIR":/backups \
  alpine sh -c "if [ -f /data/mebar.db ]; then \
      cp /data/mebar.db /backups/pre-restore-$prestamp.db; \
      [ -f /data/mebar.db-wal ] && cp /data/mebar.db-wal /backups/pre-restore-$prestamp.db-wal; \
      [ -f /data/mebar.db-shm ] && cp /data/mebar.db-shm /backups/pre-restore-$prestamp.db-shm; \
      true; \
    else echo 'no existing DB to snapshot'; fi"

# 8. Swap the file in and clear the WAL/SHM sidecars -------------------------
# Deleting mebar.db-wal/-shm is the critical step: a stale write-ahead log
# from the previous database would replay over the restored file and corrupt it.
abs="$(cd "$(dirname "$work")" && pwd)/$(basename "$work")"
log "swapping database into volume $volume"
docker run --rm \
  -v "$volume":/data \
  -v "$abs":/restore/src.db:ro \
  alpine sh -c 'cp /restore/src.db /data/mebar.db && rm -f /data/mebar.db-wal /data/mebar.db-shm'

# 9. Restart -----------------------------------------------------------------
log "starting app"
# shellcheck disable=SC2086
$COMPOSE up -d app

# 10. Verify (condition-based wait, not a flat sleep) -------------------------
log "verifying restored database…"
ok=0
i=0
while [ "$i" -lt 30 ]; do
  # shellcheck disable=SC2086
  if out="$($COMPOSE exec -T app node -e "const db=require('better-sqlite3')('/app/data/mebar.db');if(db.pragma('integrity_check',{simple:true})!=='ok')process.exit(2);console.log('users='+db.prepare('select count(*) c from user').get().c+' projects='+db.prepare('select count(*) c from projects').get().c)" 2>/dev/null)"; then
    log "restored OK — $out"
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 2
done

# 11. Cleanup ----------------------------------------------------------------
[ -n "$tmp" ] && rm -f "$tmp"
[ "$ok" -eq 1 ] || die "verification did not pass in time — check '$COMPOSE logs app'"
log "done. Log in and confirm the data looks right. (Undo: re-run with $BACKUP_DIR/pre-restore-${prestamp}.db)"
