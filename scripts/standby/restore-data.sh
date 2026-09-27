#!/usr/bin/env bash
# restore-data.sh — put a deploy/vps-backup.sh archive into a standby's DATA_ROOT.
#
#   restore-data.sh <archive.tar.gz> <data-root> [expected-sha256]
#
# Same contract as deploy/vps-restore.sh, without Docker: verify the archive before touching
# anything, extract into a staging dir beside DATA_ROOT, check the database, then swap by rename.
# Nothing is deleted: the previous data is kept in <data-root>.pre-restore-<stamp>/.
#
# Refuses to run while anything has the database open (the one-writer rule: stop the server
# first). Prints the row counts it restored, so the result can be compared with the source.
#
# Needs: bash 3.2+ (macOS /bin/bash) or any later bash, tar, gzip, awk, the sqlite3 CLI, lsof, and
# sha256sum or shasum when an expected sha256 is given. Runs the same on macOS and GNU/Linux;
# scripts/standby/restore-data.test.js runs it on Linux in CI.
set -euo pipefail

archive=${1:?usage: restore-data.sh <archive.tar.gz> <data-root> [expected-sha256]}
root=${2:?usage: restore-data.sh <archive.tar.gz> <data-root> [expected-sha256]}
want_sha=${3:-}
log() { printf '[restore %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# sha256sum (GNU coreutils; macOS 26 has one in /sbin) or shasum (macOS, Perl; on Arch it lives
# only in /usr/bin/core_perl, which a non-login PATH does not carry). Same order as backup-data.sh.
if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  sha256() { echo "cannot check the sha256: neither sha256sum nor shasum is on PATH" >&2; return 1; }
fi

# True when the archive lists .backup-snapshot.db (bare, as vps-backup.sh writes it, or ./-prefixed,
# as a `tar -C dir .` writes it). awk reads the WHOLE listing on purpose. `grep -q` quits at the
# first match, and the snapshot is the first member, so tar then writes into a closed pipe and dies
# of SIGPIPE; under pipefail a valid archive was refused (exit 141 on GNU/Linux once the listing
# outgrows the 64 KiB pipe buffer; prod's 1,436-member archive lists 106,678 bytes).
has_snapshot() {
  tar tzf "$1" | awk '$0 == ".backup-snapshot.db" || $0 == "./.backup-snapshot.db" { f = 1 } END { exit !f }'
}

[[ -f $archive ]] || { echo "no such archive: $archive" >&2; exit 1; }
root=${root%/}
parent=$(dirname "$root")
mkdir -p "$parent"

if [[ -n $want_sha ]]; then
  got=$(sha256 "$archive")
  [[ $got == "$want_sha" ]] || { echo "sha256 $got != expected $want_sha" >&2; exit 1; }
  log "sha256 matches"
fi
gzip -t "$archive" || { echo "archive fails gzip -t: $archive" >&2; exit 1; }
has_snapshot "$archive" ||
  { echo "no .backup-snapshot.db in $archive — not a vps-backup.sh archive" >&2; exit 1; }
log "archive verified"

if [[ -e $root/di.db ]] && lsof -- "$root/di.db" >/dev/null 2>&1; then
  echo "refusing: $root/di.db is open by a running process — stop the server first" >&2
  lsof -- "$root/di.db" >&2 || true
  exit 1
fi

stamp=$(date +%Y%m%d-%H%M%S)
stage="$parent/.restore-stage-$stamp"
mkdir "$stage"
trap 'rm -rf "$stage"' EXIT
tar xzf "$archive" -C "$stage"
mv "$stage/.backup-snapshot.db" "$stage/di.db"

check=$(sqlite3 "$stage/di.db" 'PRAGMA integrity_check;')
[[ $check == ok ]] || { echo "integrity_check failed: $check" >&2; exit 1; }
log "integrity_check ok"
for t in $(sqlite3 "$stage/di.db" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"); do
  printf '  %-32s %s\n' "$t" "$(sqlite3 "$stage/di.db" "SELECT count(*) FROM \"$t\";")"
done

# swap by rename (same filesystem), keeping what was there
if [[ -d $root ]]; then
  mv "$root" "$root.pre-restore-$stamp"
  log "previous data kept at $root.pre-restore-$stamp"
fi
mkdir "$root"
for item in di.db uploads spaces snapshots; do
  if [[ -e $stage/$item ]]; then mv "$stage/$item" "$root/$item"; fi
done
printf '%s\n' "$(basename "$archive")" > "$root/.restored-from"
log "restored $(basename "$archive") into $root"
