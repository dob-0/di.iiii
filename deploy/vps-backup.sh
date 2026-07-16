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

set -euo pipefail
STAMP=$(date +%F_%H%M)
BACKUP_DIR=/root/backups
TMP_DB=/data/.backup-snapshot.db
LOG=/root/backups/backup.log

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

log "Starting backup $STAMP"

# Consistent SQLite snapshot via VACUUM INTO (WAL-safe, single-file, atomic)
docker exec dii-server-1 node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
if (fs.existsSync('$TMP_DB')) fs.unlinkSync('$TMP_DB');
const db = new DatabaseSync('/data/di.db', { readOnly: true });
db.exec(\"VACUUM INTO '$TMP_DB'\");
db.close();
" || { log "FAILED: sqlite snapshot"; exit 1; }

# Archive the consistent db snapshot + uploads/spaces/snapshots (skip live -wal/-shm files)
docker run --rm -v dii_data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/dii-backup-$STAMP.tar.gz" \
  -C /data .backup-snapshot.db uploads spaces snapshots \
  || { log "FAILED: tar archive"; exit 1; }

docker exec dii-server-1 rm -f "$TMP_DB"

# Prune backups older than 14 days
find "$BACKUP_DIR" -name 'dii-backup-*.tar.gz' -mtime +14 -delete

SIZE=$(du -h "$BACKUP_DIR/dii-backup-$STAMP.tar.gz" | cut -f1)
log "Backup complete: dii-backup-$STAMP.tar.gz ($SIZE)"
