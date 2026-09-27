#!/usr/bin/env bash
# backup-data.sh — the nightly backup of a standby's DATA_ROOT, in exactly deploy/vps-backup.sh's format.
#
#   backup-data.sh <data-root> <out-dir> [keep]
#
# Writes <out-dir>/dii-backup-<YYYY-MM-DD_HHMM>.tar.gz. The stamp is UTC, as prod's was (the VPS ran on
# UTC), so archives from both sort into one timeline and two machines never mint the same name for
# different data. The archive holds what vps-backup.sh puts in it, under the same member names:
#   .backup-snapshot.db   a consistent copy of <data-root>/di.db, taken with VACUUM INTO while the
#                         server keeps running (WAL-safe: a read transaction, never a torn file copy)
#   uploads/ spaces/ snapshots/
# so restore-data.sh (and deploy/vps-restore.sh) read it unchanged. Then, in this order:
#   1. verify before publishing: PRAGMA integrity_check of the snapshot, gzip -t, a full tar listing
#      that must contain .backup-snapshot.db
#   2. publish atomically: <archive>.sha256 (the `sha256sum -c` / `shasum -a 256 -c` format) and then
#      the archive, each written under a hidden .tmp name and renamed; a half-written archive never
#      carries the real name, and every archive under the real name already has its checksum
#   3. prune to the newest <keep> archives (default 14, by count — a job that stops running never ages
#      its own last copies away), only after a good archive exists
#   4. write <out-dir>/status.json, one line:
#        {"ok":true,"newest":"dii-backup-….tar.gz","newestEpoch":…,"newestBytes":…,"newestSha256":"…",
#         "held":…,"keep":…,"epoch":<this run>,"durationS":…,"error":null}
#      On failure "ok" is false and "error" says why; newest* still describe the last good archive,
#      so a watcher can say both "it failed" and "the newest copy is N hours old".
# Exits non-zero on any failure, with the reason on stderr and in status.json. Refuses to start while
# another run holds <out-dir>/.backup.lock (exit 75, status.json and the marker untouched).
#
# The failure marker, exactly vps-backup.sh's: any failure also writes <out-dir>/BACKUP-FAILED, one
# line "[<ISO-8601 time>] backup <stamp> FAILED: <reason>", and a good run removes it, so every
# watcher that already knows prod's marker (di-bo's checkBackupFresh reads only its name) sees a
# standby's failed night the same way. It is written before status.json's "ok":false, so a run that
# cannot even write status.json still leaves it; the good run removes it just before "ok":true.
#
# Modes (umask 027): archives, sidecars, the marker 640; status.json 644, on purpose. It holds only
# the fields above (names, sizes, times, a checksum, an error line; no data), and the out-dir is
# meant to stay 750 with no "other" search bit, so 644 opens it to nobody who cannot already enter
# the directory: the owner, its group, and a user given search on the directory by an ACL (the
# Mac standby grants its public bot list+search there, so the bot reads health without reading
# any archive).
#
# Space: refuses to start unless the out-dir's filesystem has room for the snapshot and an archive
# of the uncompressed size, plus 1 GiB, so a backup can never fill the disk a live server writes to.
#
# Not in the archive, because vps-backup.sh never put them there: other files at the top of
# DATA_ROOT (follows.json, machine.json, rig/). The format is prod's, on purpose; changing it is a
# change to both scripts and to the restore.
#
# Needs: bash 3.2+ (macOS /bin/bash), the sqlite3 CLI (3.27+ for VACUUM INTO), tar, gzip, and
# sha256sum or shasum. macOS's bsdtar is told to write no AppleDouble/xattr members.
set -Eeuo pipefail
umask 027
export LC_ALL=C             # glob order = byte order, so the timeline sorts the same everywhere
export COPYFILE_DISABLE=1   # macOS: never add ._ AppleDouble members

usage() { echo "usage: backup-data.sh <data-root> <out-dir> [keep (default 14)]" >&2; exit 2; }
if [ $# -lt 2 ] || [ $# -gt 3 ]; then usage; fi
data=${1%/}
out=${2%/}
keep=${3:-14}
case $keep in '' | *[!0-9]*) usage ;; esac
[ "$keep" -ge 1 ] || usage

started=$(date +%s)
log() { printf '[backup %s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

if stat -c %Y / >/dev/null 2>&1; then
  mtime() { stat -c %Y "$1"; }
  fsize() { stat -c %s "$1"; }
else
  mtime() { stat -f %m "$1"; }
  fsize() { stat -f %z "$1"; }
fi
if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi
TAR_EXTRA=''
if tar --version 2>/dev/null | grep -q bsdtar; then
  TAR_EXTRA='--no-mac-metadata --no-xattrs --no-acls --no-fflags'
fi
sql() { sqlite3 -bail -batch -init /dev/null "$@"; }

json_str() { # a JSON string literal, or null for empty
  if [ -z "$1" ]; then printf 'null'; return; fi
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\t' '  ')"
}

stage=''
stamp=''
tmp_archive=''
tmp_sidecar=''
locked=0
status_ok=0

write_status() { # <ok true|false> [error]
  local ok=$1 err=${2:-} f newest='' nep=0 nbytes=0 nsha='' held=0 now tmp
  for f in "$out"/dii-backup-*.tar.gz; do
    [ -e "$f" ] || continue
    held=$((held + 1))
    newest=$f
  done
  if [ -n "$newest" ]; then
    nep=$(mtime "$newest")
    nbytes=$(fsize "$newest")
    nsha=$(cut -d' ' -f1 "$newest.sha256" 2>/dev/null || true)
    newest=$(basename "$newest")
  fi
  now=$(date +%s)
  tmp="$out/.status.json.tmp"
  printf '{"ok":%s,"newest":%s,"newestEpoch":%s,"newestBytes":%s,"newestSha256":%s,"held":%s,"keep":%s,"epoch":%s,"durationS":%s,"error":%s}\n' \
    "$ok" "$(json_str "$newest")" "$nep" "$nbytes" "$(json_str "$nsha")" "$held" "$keep" \
    "$now" "$((now - started))" "$(json_str "$err")" > "$tmp"
  chmod 644 "$tmp"   # readable by whoever may enter the out-dir: see "Modes" above
  mv -f "$tmp" "$out/status.json"
}

write_marker() { # <reason> — prod's BACKUP-FAILED, same name, same one-line format
  printf '[%s] backup %s FAILED: %s\n' "$(date -u -Iseconds)" "${stamp:-$(date -u +%F_%H%M)}" "$1" \
    > "$out/BACKUP-FAILED"
}

cleanup() {
  if [ -n "$stage" ]; then rm -rf "$stage"; fi
  if [ -n "$tmp_archive" ]; then rm -f "$tmp_archive"; fi
  if [ -n "$tmp_sidecar" ]; then rm -f "$tmp_sidecar"; fi
  if [ "$locked" = 1 ]; then rm -rf "$out/.backup.lock"; fi
}

fail() {
  trap - ERR
  echo "backup FAILED: $1" >&2
  if [ -d "$out" ] && [ "$status_ok" = 0 ]; then
    write_marker "$1" || echo "backup: could not write $out/BACKUP-FAILED either" >&2
    write_status false "$1" || echo "backup: could not write $out/status.json either" >&2
  fi
  cleanup
  exit 1
}
trap 'fail "unexpected error at line $LINENO (exit $?)"' ERR
trap 'fail "stopped by a signal before it finished"' HUP INT TERM
trap cleanup EXIT

# ---- preconditions ----------------------------------------------------------------------------
[ -d "$out" ] || mkdir -p "$out" || { echo "backup FAILED: cannot create $out" >&2; exit 1; }
[ -w "$out" ] || { echo "backup FAILED: $out is not writable" >&2; exit 1; }
[ -f "$data/di.db" ] || fail "no database at $data/di.db — wrong data root?"
data_abs=$(cd "$data" && pwd -P)
out_abs=$(cd "$out" && pwd -P)
case "$out_abs/" in "$data_abs"/*) fail "out-dir $out_abs is inside the data root $data_abs" ;; esac
case "$out_abs" in *\'*) fail "out-dir path contains a single quote: $out_abs" ;; esac
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 CLI not found"

# one run at a time: mkdir is atomic everywhere (macOS has no flock(1))
if ! mkdir "$out/.backup.lock" 2>/dev/null; then
  holder=$(cat "$out/.backup.lock/pid" 2>/dev/null || true)
  lock_age=$(( $(date +%s) - $(mtime "$out/.backup.lock" 2>/dev/null || date +%s) ))
  # no pid yet and a young lock = a run that is between its mkdir and its pid write
  if { [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; } || { [ -z "$holder" ] && [ "$lock_age" -lt 3600 ]; }; then
    echo "backup: another run (pid ${holder:-starting}) holds $out/.backup.lock — not starting" >&2
    trap - ERR EXIT
    exit 75
  fi
  log "removing a stale lock (pid ${holder:-unknown} is gone)"
  rm -rf "$out/.backup.lock"
  mkdir "$out/.backup.lock" || fail "cannot take $out/.backup.lock"
fi
locked=1
echo $$ > "$out/.backup.lock/pid"

# anything hidden and half-made is from a run that died; the lock says no run is alive
for f in "$out"/.dii-backup-*.tmp "$out"/.stage-*; do
  [ -e "$f" ] || continue
  log "removing leftover $(basename "$f")"
  rm -rf "$f"
done

stamp=$(date -u +%F_%H%M)
name="dii-backup-$stamp.tar.gz"
[ ! -e "$out/$name" ] || fail "$name already exists — two runs in the same minute; not overwriting"

dirs=''
for d in uploads spaces snapshots; do
  if [ -d "$data/$d" ]; then dirs="$dirs $d"; else log "WARNING: $data/$d does not exist — archived without it"; fi
done

db_kb=$(du -sk "$data/di.db" | cut -f1)
data_kb=$db_kb
for d in $dirs; do data_kb=$((data_kb + $(du -sk "$data/$d" | cut -f1))); done
need_kb=$((db_kb + data_kb + 1048576))
avail_kb=$(df -Pk "$out" | awk 'NR == 2 { print $4 }')
[ "$avail_kb" -ge "$need_kb" ] ||
  fail "not enough space in $out: ${avail_kb} KiB free, need ${need_kb} KiB (snapshot + archive + 1 GiB reserve)"
log "start $name — data ${data_kb} KiB (db ${db_kb} KiB), ${avail_kb} KiB free"

# ---- 1. snapshot: VACUUM INTO, read-only on the live database ----------------------------------
stage="$out/.stage-$stamp"
mkdir -m 700 "$stage"
snap="$stage/.backup-snapshot.db"
sql -readonly -cmd '.timeout 60000' "$data/di.db" "VACUUM INTO '$snap';" ||
  fail "VACUUM INTO failed on $data/di.db"
check=$(sql -readonly "$snap" 'PRAGMA integrity_check;') || fail "integrity_check could not run on the snapshot"
[ "$check" = ok ] || fail "snapshot integrity_check: $(printf '%s' "$check" | head -3 | tr '\n' ' ')"
rows=''
for t in $(sql -readonly "$snap" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"); do
  rows="$rows $t=$(sql -readonly "$snap" "SELECT count(*) FROM \"$t\";")"
done
rm -f "$snap-wal" "$snap-shm"
log "snapshot ok ($(fsize "$snap") bytes, integrity_check ok) rows:$rows"

# ---- 2. archive, verified before it gets its name ----------------------------------------------
tmp_archive="$out/.$name.tmp"
# shellcheck disable=SC2086  # TAR_EXTRA and dirs are word lists by design (bash 3.2: no empty arrays under set -u)
tar $TAR_EXTRA -czf "$tmp_archive" -C "$stage" .backup-snapshot.db -C "$data" $dirs ||
  fail "tar failed writing $tmp_archive"
gzip -t "$tmp_archive" || fail "gzip -t failed on the new archive"
members=$(tar -tzf "$tmp_archive" | awk '
  $0 == ".backup-snapshot.db" || $0 == "./.backup-snapshot.db" { db = 1 }
  { n++ }
  END { if (!db) exit 3; print n }') || fail "the new archive does not list cleanly or has no .backup-snapshot.db"
sum=$(sha256 "$tmp_archive")
bytes=$(fsize "$tmp_archive")
rm -rf "$stage"
stage=''

# ---- 3. publish: checksum first, then the archive -----------------------------------------------
tmp_sidecar="$out/.$name.sha256.tmp"
printf '%s  %s\n' "$sum" "$name" > "$tmp_sidecar"
chmod 640 "$tmp_archive" "$tmp_sidecar"
sync
[ ! -e "$out/$name" ] || fail "$name appeared while this run was writing it; not overwriting"
mv -f "$tmp_sidecar" "$out/$name.sha256"
tmp_sidecar=''
mv -f "$tmp_archive" "$out/$name"
tmp_archive=''
log "wrote $name ($bytes bytes, $members members, sha256 $sum)"

# ---- 4. prune to the newest $keep, by name (the stamp sorts) ------------------------------------
set -- "$out"/dii-backup-*.tar.gz
if [ -e "$1" ] && [ $# -gt "$keep" ]; then
  drop=$(($# - keep))
  while [ "$drop" -gt 0 ]; do
    log "pruning $(basename "$1")"
    rm -f "$1" "$1.sha256"
    shift
    drop=$((drop - 1))
  done
fi
for f in "$out"/dii-backup-*.tar.gz.sha256; do   # a checksum whose archive is gone
  [ -e "$f" ] || continue
  if [ ! -e "${f%.sha256}" ]; then log "removing orphan $(basename "$f")"; rm -f "$f"; fi
done

rm -f "$out/BACKUP-FAILED"   # this run is good: the last failure's word no longer holds (vps-backup.sh does the same)
write_status true
status_ok=1
set -- "$out"/dii-backup-*.tar.gz
log "done — $name, $# held (keep $keep), $(( $(date +%s) - started ))s"
