#!/bin/bash
# One green horizontal line on the 4 cubes for 10 s, then blackout + disarm.
# Your Enter in this window is the laser sign-off. Stop at any time: Ctrl+C (blackout + disarm run on exit).
set -u
API=http://127.0.0.1:4000/laser/api
TOK="x-laser-token: $(cat "$HOME/.di/data/laser/.token" 2>/dev/null | tr -d "\n")"
stop() {
  curl -s -m4 -X POST $API/blackout -H 'Content-Type: application/json' -H "$TOK" -d '{}' >/dev/null
  curl -s -m4 -X POST $API/arm -H 'Content-Type: application/json' -H "$TOK" -d '{"armed":false}' | head -c 120; echo
  echo "== blackout + disarmed"
}
main() {
  if [ "${*: -1}" = "--dry-run" ]; then
    echo "would: arm the 4 cubes (sign-off), send one green line [-0.6..0.6, y 0] to all for 10 s, then blackout + disarm"
    curl -s -m4 $API/state | python3 -c "import json,sys;d=json.load(sys.stdin);print('armed now',d['armed']);[print(c['id'],c['ip'],'conn',c['connected']) for c in d['cubes']]"
    return 0
  fi
  trap stop EXIT INT TERM
  echo "== arming 4 cubes"
  R=$(curl -s -m6 -X POST $API/arm -H 'Content-Type: application/json' -H "$TOK" \
    -d '{"armed":true,"confirm":"the laser safety officer has signed off"}'); echo "${R:0:300}"
  case "$R" in *'"armed":true'*) ;; *) echo "!! NOT ARMED — nothing drawn"; exit 1 ;; esac
  LINE='{"cube":"all","points":[[-0.6,0,0,0,0],[-0.6,0,0,1,0],[0.6,0,0,1,0],[0.6,0,0,0,0]]}'
  echo "== drawing one green line for 10 s"
  end=$((SECONDS+10))
  curl -s -m2 -X POST $API/frame -H 'Content-Type: application/json' -H "$TOK" -d "$LINE" | head -c 120; echo
  while [ $SECONDS -lt $end ]; do   # hold the frame: keep-alive only, never a repeat frame (a repeat inserts blank bridges)
    curl -s -m1 -X POST $API/alive -H 'Content-Type: application/json' -H "$TOK" -d '{"cube":"all"}' >/dev/null
    sleep 0.05
  done
  curl -s -m4 $API/state | python3 -c "import json,sys;d=json.load(sys.stdin);print('armed',d['armed']);[print(c['id'],c['ip'],'conn',c['connected'],'armed',c['armed'],'stop',c['stop']) for c in d['cubes']]"
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
