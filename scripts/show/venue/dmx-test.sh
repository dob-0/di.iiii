#!/bin/bash
# DMX test on the 4 fixtures (A1, 3ch, at 1/4/7/10) through PONYO's desk sACN input (universe 1, UDP 5568).
# Needs: Emily has sACN input ON in the PONYO desk. Your Enter = you and Emily are watching the lights.
# Steps: restart hub with DMX -> claim dmx (master 0.3) -> calm 8 s -> rising 8 s -> KILL 6 s (lights must stay dark) -> release claim.
# Undo: bash hub-down.sh ; then bash hub-up.sh  (outputs off again)
set -u
D=/home/dob/work/show-tools/2026-11-07; C=http://127.0.0.1:4400/api/control
ctl() { curl -s -m3 -X POST $C -H 'content-type: application/json' -d "$1" | head -c 160; echo; }
main() {
  if [ "${*: -1}" = "--dry-run" ]; then echo "would: hub-down, hub-up --dmx sacn:10.0.0.216 --lasers off --osc-in off, claim dmx at master 0.3, calm, rising, kill, release"; ping -c1 -W1 10.0.0.216 >/dev/null && echo "PONYO answers" || echo "PONYO not reachable (off-LAN now)"; return 0; fi
  bash $D/hub-down.sh; bash $D/hub-up.sh --dmx sacn:10.0.0.216 --lasers off --osc-in off || return 1
  echo "== claim dmx, master 0.3, scene calm (8 s)"; ctl '{"claim":{"output":"dmx","holder":"hub"},"master":0.3,"scene":"calm"}'; sleep 8
  echo "== scene rising (8 s)"; ctl '{"scene":"rising"}'; sleep 8
  echo "== KILL (6 s): the lights must go dark AND stay dark"; ctl '{"mode":"kill"}'; sleep 6
  echo "== release dmx to the desk, resume"; ctl '{"claim":{"output":"dmx","holder":"none"}}'; ctl '{"mode":"live"}'
  curl -s -m3 127.0.0.1:4400/health | head -c 300; echo
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
