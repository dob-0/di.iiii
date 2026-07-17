#!/bin/bash
# Restore a backup produced by deploy/vps-backup.sh onto the VPS.
#
# THIS OVERWRITES THE LIVE DATA VOLUME. Run only for a genuine disaster
# recovery, and only after confirming which backup you actually want —
# ls /root/backups/ to see what's available.
#
# Usage (on the VPS, as root):
#   ./vps-restore.sh /root/backups/dii-backup-2026-07-16_0317.tar.gz
#
# What it does:
#   1. Stops dii-server-1 (so nothing writes to the volume mid-restore)
#   2. Extracts the backup's db snapshot + uploads/spaces/snapshots into the
#      dii_data volume, replacing what's there now
#   3. Restarts the stack
#
# This has been written but NOT executed against production — dry-run it
# against a scratch volume first if you've never run it before:
#   docker volume create dii-restore-test
#   docker run --rm -v dii-restore-test:/data -v /root/backups:/backup alpine \
#     tar xzf /backup/<file>.tar.gz -C /data
#   docker run --rm -v dii-restore-test:/data alpine ls -la /data

set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "usage: $0 <path-to-backup.tar.gz>" >&2
  echo "available backups:" >&2
  ls -lh /root/backups/dii-backup-*.tar.gz 2>/dev/null >&2 || echo "  (none found in /root/backups)" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "error: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "About to restore from: $BACKUP_FILE"
echo "This will STOP dii-server-1 and OVERWRITE the live dii_data volume."
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

echo "== stopping dii-server-1 =="
docker stop dii-server-1

echo "== extracting backup into dii_data volume =="
# dii-server-1 runs as uid 100 / gid 101 (the 'app' user); the alpine
# container here runs as root, so ownership after extraction depends on
# what's baked into the archive rather than the live container's user.
# Force it explicitly instead of trusting that to hold.
docker run --rm -v dii_data:/data -v "$(dirname "$BACKUP_FILE")":/backup alpine sh -c "
  cd /data &&
  rm -rf uploads spaces snapshots di.db di.db-wal di.db-shm &&
  tar xzf /backup/$(basename "$BACKUP_FILE") &&
  mv .backup-snapshot.db di.db &&
  chown -R 100:101 /data
"

echo "== restarting stack =="
cd /opt/di.iiii
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "== done — verify with: curl -s https://di-studio.xyz/serverXR/api/health =="
