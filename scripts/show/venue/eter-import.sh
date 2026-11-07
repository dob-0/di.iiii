#!/bin/bash
# Import Eter's lava bundle (from her PROD space "lava", sent via di.bo) into this Mac's di, print the local URL.
# Note: `di open` has NO dry-run (it imports) — this script's --dry-run only checks the file.
# Undo: delete the imported project/space in this Mac's di (named in the di open output).
set -u
DI=$HOME/.di/bin/di
main() {
  local f="${1:-}"; [ -n "$f" ] && [ "$f" != "--dry-run" ] || { echo "usage: eter-import.sh <file.diiii> [--dry-run]"; return 2; }
  [ -f "$f" ] || { echo "!! no file $f"; return 1; }
  file -b "$f" | grep -qi gzip || { echo "!! $f is not gzip ($(file -b "$f" | cut -c1-60)) — refused"; return 1; }
  echo "== $f: gzip, $(du -h "$f" | cut -f1), sha256 $(sha256sum "$f" | cut -c1-16)"
  [ "${*: -1}" = "--dry-run" ] && { echo "would: $DI open $f"; return 0; }
  $DI open "$f" 2>&1 | tail -12
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
