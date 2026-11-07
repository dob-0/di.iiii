#!/bin/bash
# Start the show hub on studio-mac (background), after running its tests. Extra args go to the hub (default: outputs OFF).
# Undo: bash hub-down.sh
set -u
D=/home/dob/work/show-tools/2026-11-07; W=/home/dob/work/di.iiii/.claude/worktrees/agent-a41e5fd929a6b629c
N=$D/node/node-v22.11.0-linux-x64/bin/node; LOG=$HOME/di-health/show; mkdir -p "$LOG"
ARGS=("$@"); [ "${ARGS[-1]:-}" = "--dry-run" ] && { DRY=1; unset 'ARGS[-1]'; } || DRY=0
[ ${#ARGS[@]} -eq 0 ] && ARGS=(--dmx off --lasers off --osc-in off)
IP=$(ip -4 -br addr | awk '{for(i=3;i<=NF;i++) if($i ~ /^10\.0\.0\./){split($i,a,"/"); print a[1]; exit}}')
main() {
  echo "== hub commit: $(git -C $W log --oneline -1)"; echo "== show-LAN ip: ${IP:-NONE (adapter not plugged?)}"
  if [ $DRY = 1 ]; then echo "would: run tests, start: node scripts/show/lava-hub.mjs --port 4400 ${ARGS[*]}"; pgrep -fa 'lava-hub.mjs' | grep -v pgrep || echo "no hub running"; return 0; fi
  pgrep -f 'scripts/show/lava-hub.mjs' >/dev/null && { echo "!! a hub is already running — run hub-down.sh first"; return 1; }
  cd $W && ln -sfn $D/deps/node_modules node_modules
  T=$LOG/hub-tests-$(date +%H%M).log; $N node_modules/vitest/vitest.mjs run --root scripts/show --config $D/vt.config.mjs >"$T" 2>&1; rc=$?
  grep -E "Test Files|Tests " "$T"; [ $rc = 0 ] || { echo "!! tests failed ($T) — hub NOT started"; return 1; }
  setsid nohup $N scripts/show/lava-hub.mjs --port 4400 "${ARGS[@]}" >>$LOG/hub.log 2>&1 < /dev/null & disown
  sleep 2; curl -s -m3 127.0.0.1:4400/health | head -c 300; echo
  echo "== link for the tablet: http://${IP:-<ip>}:4400/game   control: http://${IP:-<ip>}:4400/control   home: http://${IP:-<ip>}:4400/"
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main
