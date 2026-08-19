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
#   1. Verifies the archive BEFORE stopping anything or touching live data
#   2. Stops dii-server-1 (so nothing writes to the volume mid-restore)
#   3. Extracts into a staging directory inside the volume, then swaps the
#      live data aside (kept, not deleted) and moves the restored data in
#   4. Restarts the stack
#
# The previous version ran `rm -rf <live data> && tar xzf <archive>` in one
# shell, so a truncated or corrupt archive deleted production and restored
# nothing. Nothing here deletes: a failed restore leaves the volume as it was,
# and a completed one leaves the old data in /data/.pre-restore-<stamp>.
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

# Verify the archive BEFORE the confirmation prompt, so an operator is never
# asked to authorise a restore from a file that cannot produce one.
echo "== verifying archive =="
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "error: archive fails its gzip integrity check: $BACKUP_FILE" >&2
  echo "       pick another backup - this one cannot be restored from." >&2
  exit 1
fi
# vps-backup.sh writes the member bare (`.backup-snapshot.db`), but a tar built
# with `-C /data .` stores it as `./.backup-snapshot.db` — accept either.
if ! tar tzf "$BACKUP_FILE" 2>/dev/null | grep -qx '\(\./\)\?\.backup-snapshot\.db'; then
  echo "error: archive contains no .backup-snapshot.db member: $BACKUP_FILE" >&2
  echo "       this is not a di.iiii backup produced by deploy/vps-backup.sh." >&2
  exit 1
fi
echo "archive OK"

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
docker run --rm -v dii_data:/data -v "$(dirname "$BACKUP_FILE")":/backup alpine sh -c "
  set -e
  STAMP=\$(date +%Y%m%d-%H%M%S)
  STAGE=/data/.restore-stage-\$STAMP
  KEEP=/data/.pre-restore-\$STAMP
  mkdir -p \"\$STAGE\"

  # Extract into staging first. If the archive is bad this fails here, with the
  # live data still fully in place.
  tar xzf /backup/$(basename "$BACKUP_FILE") -C \"\$STAGE\"
  test -f \"\$STAGE/.backup-snapshot.db\"
  mv \"\$STAGE/.backup-snapshot.db\" \"\$STAGE/di.db\"

  # Swap: move the live data aside rather than deleting it, then move the
  # restored data in. Both halves are renames within one filesystem, so the
  # window in which the volume is half-restored is as short as it can be.
  mkdir -p \"\$KEEP\"
  for item in uploads spaces snapshots di.db di.db-wal di.db-shm; do
    if [ -e \"/data/\$item\" ]; then mv \"/data/\$item\" \"\$KEEP/\$item\"; fi
  done
  for item in uploads spaces snapshots di.db; do
    if [ -e \"\$STAGE/\$item\" ]; then mv \"\$STAGE/\$item\" \"/data/\$item\"; fi
  done
  rmdir \"\$STAGE\" 2>/dev/null || true

  # dii-server-1 runs as uid 100 / gid 101 (the 'app' user); this container
  # runs as root, so ownership after extraction depends on what is baked into
  # the archive rather than the live container's user. Force it explicitly.
  chown -R 100:101 /data
  echo \"previous data kept at \$KEEP - delete it once the restore is verified\"
"

echo "== restarting stack =="
cd /opt/di.iiii
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "== done — verify with: curl -s https://di-studio.xyz/serverXR/api/health =="
