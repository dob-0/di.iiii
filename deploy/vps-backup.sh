#!/bin/bash
# Nightly production backup — runs on the VPS via cron (currently `17 3 * * *`
# in root's crontab). Lives here for version control; the live copy is at
# /root/vps-backup.sh on the VPS and must be kept in sync with this file by
# hand (no deploy step copies it — see docs/deploy/VPS_DOCKER_DEPLOY.md).
#
# Takes a consistent SQLite snapshot (VACUUM INTO, WAL-safe) of the running
# dii-server-1 container's DB, then tars it together with uploads/spaces/
# snapshots from the data volume. Prunes anything older than 14 days.
#
# Companion restore script: deploy/vps-restore.sh.

set -Eeuo pipefail
STAMP=$(date +%F_%H%M)
BACKUP_DIR=/root/backups
TMP_DB=/data/.backup-snapshot.db
LOG=/root/backups/backup.log
# Deliberately shouty and sorted next to the archives: `ls /root/backups` and
# the off-box pull both walk past it.
FAIL_MARKER=/root/backups/BACKUP-FAILED

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

# Every failure used to end as one line in $LOG, which nothing reads — the
# detector existed, the notification did not. Now a failure also leaves the
# marker file, POSTs to $BACKUP_ALERT_WEBHOOK_URL when one is configured (see
# docs/deploy/OFFBOX_BACKUP.md — the channel itself is still an open choice),
# and exits non-zero so cron's own mail/status carries it too.
fail() {
  log "FAILED: $1"
  printf '[%s] backup %s FAILED: %s\n' "$(date -Is)" "$STAMP" "$1" > "$FAIL_MARKER"
  if [ -n "${BACKUP_ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"di.iiii backup FAILED on $(hostname): $1\"}" \
      "$BACKUP_ALERT_WEBHOOK_URL" >/dev/null \
      || log "alert webhook post failed (backup failure above is still unreported)"
  fi
  exit 1
}
# Catches the failures nobody thought to guard, not just the two below.
trap 'fail "unexpected error at line $LINENO"' ERR

log "Starting backup $STAMP"

# Consistent SQLite snapshot via VACUUM INTO (WAL-safe, single-file, atomic)
docker exec dii-server-1 node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
if (fs.existsSync('$TMP_DB')) fs.unlinkSync('$TMP_DB');
const db = new DatabaseSync('/data/di.db', { readOnly: true });
db.exec(\"VACUUM INTO '$TMP_DB'\");
db.close();
" || fail "sqlite snapshot"

# Archive the consistent db snapshot + uploads/spaces/snapshots (skip live -wal/-shm files)
docker run --rm -v dii_data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/dii-backup-$STAMP.tar.gz" \
  -C /data .backup-snapshot.db uploads spaces snapshots \
  || fail "tar archive"

docker exec dii-server-1 rm -f "$TMP_DB"

# Prune backups older than 14 days
find "$BACKUP_DIR" -name 'dii-backup-*.tar.gz' -mtime +14 -delete

SIZE=$(du -h "$BACKUP_DIR/dii-backup-$STAMP.tar.gz" | cut -f1)
rm -f "$FAIL_MARKER"
log "Backup complete: dii-backup-$STAMP.tar.gz ($SIZE)"
