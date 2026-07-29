#!/usr/bin/env bash
# Pull di.iiii production backups OFF the VPS onto this machine.
#
# The nightly `deploy/vps-backup.sh` writes archives to /root/backups on the
# VPS and prunes them after 14 days. Until this script existed, that was the
# only copy: one machine, one disk. A host failure, a bad `rm`, or ransomware
# took the database, every upload and every space with it.
#
# PULL, not push, and that is the point. If the VPS pushed to a bucket it would
# need write credentials, and anyone who owned the box would own the backups
# too — deleting the off-box copies is step one of any competent ransomware.
# Here the VPS holds no credential to this machine and cannot reach it. The
# trust arrow points one way: this machine reads the VPS, never the reverse.
#
# Usage:
#   scripts/backup-pull.sh                 # pull anything new, verify, prune
#   scripts/backup-pull.sh --dry-run       # show what would transfer
#   scripts/backup-pull.sh --verify-only   # re-verify local copies, no transfer
#
# Config (env or defaults):
#   DII_VPS_HOST    ssh target                    (default: dii-vps)
#   DII_VPS_DIR     remote backup dir             (default: /root/backups)
#   DII_BACKUP_DEST local destination             (default: ~/di-backups)
#   DII_KEEP        local archives to retain      (default: 30)
#   DII_MAX_AGE_H   warn if newest is older than  (default: 36)
#
# Exit codes: 0 ok · 1 usage/precondition · 2 transfer failed
#             3 integrity check failed · 4 backups are stale

set -euo pipefail

VPS_HOST="${DII_VPS_HOST:-dii-vps}"
VPS_DIR="${DII_VPS_DIR:-/root/backups}"
DEST="${DII_BACKUP_DEST:-$HOME/di-backups}"
KEEP="${DII_KEEP:-30}"
MAX_AGE_H="${DII_MAX_AGE_H:-36}"

DRY_RUN=0
VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { log "ERROR: $*" >&2; }

mkdir -p "$DEST"

# One run at a time. Two concurrent pulls of a 700 MB archive would fight over
# the same partial file; a timer firing while a slow run is still going is the
# normal way that happens.
LOCK="$DEST/.pull.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  log "another backup-pull is already running — exiting"
  exit 0
fi

verify_archive() {
  # gzip -t walks the whole stream and checks the CRC, so a truncated or
  # bit-rotted archive fails here rather than on the day you need to restore.
  local file="$1"
  gzip -t "$file" 2>/dev/null
}

if [ "$VERIFY_ONLY" -eq 1 ]; then
  log "verifying local archives in $DEST"
  bad=0 checked=0
  for f in "$DEST"/dii-backup-*.tar.gz; do
    [ -e "$f" ] || { log "no local archives found"; exit 1; }
    checked=$((checked + 1))
    if verify_archive "$f"; then
      log "  ok      $(basename "$f")"
    else
      fail "  CORRUPT $(basename "$f")"
      bad=$((bad + 1))
    fi
  done
  log "verified $checked archive(s), $bad corrupt"
  [ "$bad" -eq 0 ] || exit 3
  exit 0
fi

log "listing backups on $VPS_HOST:$VPS_DIR"
# `|| true` on the remote side matters: an unmatched glob makes `ls` exit
# non-zero, which would otherwise be reported as "cannot reach host" — sending
# whoever is on call after an ssh fault when the real problem is that the
# nightly job stopped producing archives. Only a genuine ssh failure exits here.
if ! REMOTE_LIST=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS_HOST" \
    "ls -1 $VPS_DIR/dii-backup-*.tar.gz 2>/dev/null || true" </dev/null); then
  fail "cannot reach $VPS_HOST over ssh"
  exit 1
fi

if [ -z "$REMOTE_LIST" ]; then
  fail "no backups found in $VPS_HOST:$VPS_DIR — the nightly job may be broken"
  exit 1
fi

REMOTE_COUNT=$(printf '%s\n' "$REMOTE_LIST" | wc -l | tr -d ' ')
NEWEST_REMOTE=$(printf '%s\n' "$REMOTE_LIST" | sort | tail -1)
log "$REMOTE_COUNT remote archive(s), newest: $(basename "$NEWEST_REMOTE")"

# A backup job that silently stopped running looks exactly like a healthy one
# until you need a restore — so check the age of the newest archive, not just
# that archives exist.
REMOTE_EPOCH=$(ssh -o BatchMode=yes "$VPS_HOST" \
  "stat -c %Y '$NEWEST_REMOTE'" </dev/null 2>/dev/null || echo 0)
STALE=0
if [ "$REMOTE_EPOCH" -gt 0 ]; then
  AGE_H=$(( ( $(date +%s) - REMOTE_EPOCH ) / 3600 ))
  log "newest remote backup is ${AGE_H}h old"
  if [ "$AGE_H" -gt "$MAX_AGE_H" ]; then
    fail "newest backup is ${AGE_H}h old (threshold ${MAX_AGE_H}h) — is the nightly cron still running?"
    STALE=1
  fi
fi

RSYNC_ARGS=(-av --partial --stats --timeout=1200
            --include='dii-backup-*.tar.gz' --exclude='*')
[ "$DRY_RUN" -eq 1 ] && RSYNC_ARGS+=(--dry-run)

log "pulling to $DEST"
if ! rsync "${RSYNC_ARGS[@]}" -e "ssh -o BatchMode=yes" \
     "$VPS_HOST:$VPS_DIR/" "$DEST/"; then
  fail "rsync failed"
  exit 2
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry run — nothing written"
  exit 0
fi

# Verify what we just landed. rsync guarantees the bytes matched in transit;
# this catches a truncated source archive or local disk trouble.
NEWEST_LOCAL="$DEST/$(basename "$NEWEST_REMOTE")"
if [ -f "$NEWEST_LOCAL" ]; then
  if verify_archive "$NEWEST_LOCAL"; then
    log "integrity ok: $(basename "$NEWEST_LOCAL") ($(du -h "$NEWEST_LOCAL" | cut -f1))"
  else
    fail "integrity FAILED for $(basename "$NEWEST_LOCAL")"
    exit 3
  fi
else
  fail "expected $(basename "$NEWEST_REMOTE") locally after rsync, but it is missing"
  exit 2
fi

# Prune oldest local copies. Deliberately keeps more than the VPS's 14 days —
# off-box retention is the whole reason this exists, and local disk is cheap.
mapfile -t LOCAL_ARCHIVES < <(find "$DEST" -maxdepth 1 -name 'dii-backup-*.tar.gz' | sort)
LOCAL_COUNT=${#LOCAL_ARCHIVES[@]}
if [ "$LOCAL_COUNT" -gt "$KEEP" ]; then
  PRUNE=$(( LOCAL_COUNT - KEEP ))
  log "pruning $PRUNE local archive(s) beyond the $KEEP most recent"
  for f in "${LOCAL_ARCHIVES[@]:0:$PRUNE}"; do
    log "  rm $(basename "$f")"
    rm -f "$f"
  done
fi

TOTAL=$(du -sh "$DEST" 2>/dev/null | cut -f1)
log "done — $(find "$DEST" -maxdepth 1 -name 'dii-backup-*.tar.gz' | wc -l | tr -d ' ') archive(s) held locally, $TOTAL"

[ "$STALE" -eq 0 ] || exit 4
exit 0
