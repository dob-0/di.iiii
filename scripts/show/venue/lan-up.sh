#!/bin/bash
# Serve this Mac's di on the show LAN (for Eter's lava page): di down && di up --lan, then print the LAN address.
# Lead decision (dob-56 13:3x): --lan lets anyone on the closed show LAN edit spaces.
# SAFETY: --lan also sets DI_ALLOW_LAN_DEVICES=1 (installed cli/runner-node.mjs:117): laser/lighting device routes
#   then answer other machines too. Laser frame/alive/arm still need the x-laser-token (file on this Mac only);
#   blackout/disarm are open (safe direction). Lighting routes under --lan: UNCHECKED. Restarting di disarms the cubes.
# Undo: di down && di up   (loopback only again)   — or: bash lan-up.sh --undo
set -u
DI=$HOME/.di/bin/di
main() {
  case "${*: -1}" in
    --dry-run) echo "would: $DI down && $DI up --lan --no-open; then print the LAN address"; $DI status 2>&1 | grep -iE "reach|lan|127.0.0.1|0.0.0.0|to change" | head -4; return 0 ;;
    --undo) $DI down && $DI up --no-open; $DI status 2>&1 | head -6; return ;;
  esac
  ip -4 -br addr | grep -q ' 10\.0\.0\.' || { echo "!! no 10.0.0.x address — plug the show-LAN adapter first"; return 1; }
  $DI down && $DI up --lan --no-open || { echo "!! di up --lan failed — undo: $DI up"; return 1; }
  sleep 2; ss -ltn | grep ':4000 ' | head -2
  IP=$(ip -4 -br addr | awk '{for(i=3;i<=NF;i++) if($i ~ /^10\.0\.0\./){split($i,a,"/"); print a[1]; exit}}')
  echo "== di on the LAN: http://$IP:4000/"; $DI status 2>&1 | tail -6
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
