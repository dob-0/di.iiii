#!/bin/bash
# Start the show hub on studio-mac (background), after running its tests. Outputs are OFF unless args turn them on.
# Usage: hub-up.sh [hub args, e.g. --dmx sacn:10.0.0.216 | --osc-out host:port] [--eter --eter-port N] [--dry-run]
#   --eter        find Eter's laptop (hostname MACBOOK-AIR-GOR) in dob-0's DHCP leases (RSA key) and add --osc-out <her ip>:<port>
#   --eter-port N the OSC port HER app listens on (no default: 9000 is OUR in-port)
# Undo: bash hub-down.sh
set -u
D=/home/dob/work/show-tools/2026-11-07; W=/home/dob/work/di.iiii/.claude/worktrees/agent-a41e5fd929a6b629c
N=$D/node/node-v22.11.0-linux-x64/bin/node; LOG=$HOME/di-health/show; mkdir -p "$LOG"
SSH=(ssh -i "$HOME/.ssh/dob0_studio_mac_rsa" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=6 root@10.0.0.1)
DRY=0; ETER=0; EPORT=""; ARGS=(--dmx off --lasers off --osc-in off)   # safe defaults; later args override (hub: last wins)
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1 ;; --eter) ETER=1 ;; --eter-port) EPORT="${2:-}"; shift ;;
  *) ARGS+=("$1") ;; esac; shift; done
IP=$(ip -4 -br addr | awk '{for(i=3;i<=NF;i++) if($i ~ /^10\.0\.0\./){split($i,a,"/"); print a[1]; exit}}')
eter_ip() { "${SSH[@]}" "grep -i ' MACBOOK-AIR-GOR ' /tmp/dhcp.leases | tail -1" 2>/dev/null | awk '{print $3}'; }
main() {
  echo "== hub commit: $(git -C $W log --oneline -1)"; echo "== show-LAN ip: ${IP:-NONE (adapter not plugged?)}"
  if [ $ETER = 1 ]; then
    [ -n "$EPORT" ] || { echo "!! --eter needs --eter-port N (her app's OSC port; 9000 is ours)"; return 2; }
    [ "$EPORT" = 9000 ] && [ "$DRY" = 0 ] && echo "-- note: 9000 is the hub's OSC in-port; fine on HER laptop, never 127.0.0.1"
    E=$(eter_ip); echo "== eter (MACBOOK-AIR-GOR): ${E:-NOT FOUND in dob-0 leases}"
    if [ -n "$E" ]; then ARGS+=(--osc-out "$E:$EPORT"); elif [ $DRY = 0 ]; then echo "!! Eter's laptop not on dob-0 — hub NOT started"; return 1; fi
  fi
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
