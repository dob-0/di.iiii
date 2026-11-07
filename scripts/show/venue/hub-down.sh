#!/bin/bash
# Stop the show hub: POST /kill (lasers blackout + DMX zeros), then SIGTERM (runs kill again on exit).
set -u
main() {
  [ "${*: -1}" = "--dry-run" ] && { echo "would: POST /kill, then stop:"; pgrep -fa 'scripts/show/lava-hub.mjs' | grep -v pgrep || echo "no hub running"; return 0; }
  curl -s -m3 -X POST 127.0.0.1:4400/kill; echo; pkill -TERM -f 'scripts/show/lava-hub.mjs'; sleep 1
  pgrep -f 'scripts/show/lava-hub.mjs' >/dev/null && echo "!! hub still running" || echo "== hub stopped"
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
