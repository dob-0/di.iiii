#!/bin/bash
# Point di's laser engine at the 4 show cubes on dob-0 (by serial + 10.0.0.x). Disarms on reload (engine does that).
# ONLY after Emily's PONYO desk has DISARMED and RELEASED the cubes (one sender per cube).
# Undo: bash laser-cubes-show.sh --restore   (writes back the backup taken by this run)
set -u
API=http://127.0.0.1:4000/laser/api; F=$HOME/.di/data/laser/laser.json; B=$HOME/.di/backups/laser.json.show-$(date +%Y%m%d-%H%M%S)
TOK="x-laser-token: $(tr -d '\n' < "$HOME/.di/data/laser/.token" 2>/dev/null)"
CUBES='{"cubes":[{"serial":"8cbfea06aa5c","ip":"10.0.0.127","name":"Cube aa5c"},{"serial":"8cbfea06ab30","ip":"10.0.0.132","name":"Cube ab30"},{"serial":"8cbfea06abc8","ip":"10.0.0.134","name":"Cube abc8"},{"serial":"8cbfea06ab50","ip":"10.0.0.164","name":"Cube ab50"}]}'
post() { curl -s -m6 -X POST $API/config -H 'Content-Type: application/json' -H "$TOK" -d "$1" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ok',d.get('ok'),d.get('error',''));[print(c.get('id'),c.get('ip')) for c in d.get('cubes',[])]"; }
main() {
  if [ "${1:-}" = "--restore" ] && [ "${*: -1}" = "--dry-run" ]; then
    L=$(ls -t $HOME/.di/backups/laser.json.show-* 2>/dev/null | head -1)
    [ -n "$L" ] && echo "would restore from $L" || { echo "no show backup yet (the forward run makes it first); stand-in = current laser.json"; L=$F; }
    echo "payload it would POST to /laser/api/config:"; python3 -c "import json;print(json.dumps({'cubes':json.load(open('$L'))['cubes']}))"; return 0
  fi
  case "${*: -1}" in
    --dry-run) echo "would: back up laser.json, then set 4 cubes:"; echo "$CUBES" | python3 -c "import json,sys;[print(c['serial'],c['ip']) for c in json.load(sys.stdin)['cubes']]"; echo "now:"; python3 -c "import json;[print(c.get('serial'),c['ip']) for c in json.load(open('$F'))['cubes']]"; return 0 ;;
    --restore) L=$(ls -t $HOME/.di/backups/laser.json.show-* 2>/dev/null | head -1); [ -n "$L" ] || { echo "!! no show backup"; return 1; }
               echo "== restoring $L"; post "$(python3 -c "import json;print(json.dumps({'cubes':json.load(open('$L'))['cubes']}))")"; return ;;
  esac
  cp -a "$F" "$B" && echo "== backup $B"; post "$CUBES"
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
