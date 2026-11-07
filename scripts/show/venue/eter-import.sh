#!/bin/bash
# Import Eter's lava bundle (from her PROD space "lava", sent via di.bo) into this Mac's di, print the local URL.
# Note: `di open` has NO dry-run (it imports) — this script's --dry-run only checks the file.
# Undo: delete the imported project/space in this Mac's di (named in the di open output).
set -u
DI=$HOME/.di/bin/di; API=http://127.0.0.1:4000/serverXR/api/spaces
ids() { curl -s -m4 $API | python3 -c "import json,sys;[print(x['id'],x.get('permanent')) for x in json.load(sys.stdin)['spaces']]"; }
main() {
  local f="${1:-}"; [ -n "$f" ] && [ "$f" != "--dry-run" ] || { echo "usage: eter-import.sh <file.diiii> [--dry-run]"; return 2; }
  [ -f "$f" ] || { echo "!! no file $f"; return 1; }
  file -b "$f" | grep -qi gzip || { echo "!! $f is not gzip ($(file -b "$f" | cut -c1-60)) — refused"; return 1; }
  echo "== $f: gzip, $(du -h "$f" | cut -f1), sha256 $(sha256sum "$f" | cut -c1-16)"
  [ "${*: -1}" = "--dry-run" ] && { echo "would: $DI open $f, then list new spaces + permanent flag"; echo "spaces now:"; ids; return 0; }
  B=$(ids | cut -d' ' -f1 | sort)
  $DI open "$f" 2>&1 | tail -12
  ids | while read -r id perm; do echo "$B" | grep -qx "$id" && continue
    echo "== imported space: $id  permanent=$perm"
    [ "$perm" = True ] && echo "-- undo (permanent space, DELETE alone answers 409 space_protected): curl -X PATCH $API/$id -H 'content-type: application/json' -d '{\"permanent\":false}' && curl -X DELETE $API/$id && curl -X DELETE $API/$id/purge"
  done
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
