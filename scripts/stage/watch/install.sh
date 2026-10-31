#!/usr/bin/env bash
# scripts/stage/watch/install.sh — put the stage watch on a show machine (root: the owner's window, in daylight).
#   install.sh [--dry-run] [--venue FILE] [--usb-mode warn|cut]   write the units, the udev rule and the defaults; start it
#   install.sh --uninstall [--dry-run]                             stop it and remove them (the record and the cut ledger stay)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dry=0; uninstall=0; venue=""; mode="warn"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    --venue) venue="$2"; shift ;;
    --usb-mode) mode="$2"; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
case "$mode" in warn|cut) ;; *) echo "install.sh: --usb-mode is warn or cut" >&2; exit 2 ;; esac
node="$(command -v node || true)"
[ -n "$node" ] || { echo "install.sh: node is not on PATH" >&2; exit 1; }
units=/etc/systemd/system; rules=/etc/udev/rules.d; defaults=/etc/default/di-stage-watch
run() { if [ "$dry" = 1 ]; then echo "would run: $*"; else "$@"; fi; }
put() {
  if [ "$dry" = 1 ]; then echo "would write $2"; sed -e "s|@NODE@|$node|g" -e "s|@WATCH_DIR@|$here|g" "$1" | grep -E '^(Exec|ACTION|Unit=|OnActive)' | sed 's/^/    /'
  else sed -e "s|@NODE@|$node|g" -e "s|@WATCH_DIR@|$here|g" "$1" > "$2.tmp" && mv "$2.tmp" "$2"; fi
}
[ "$dry" = 1 ] || [ "$(id -u)" = 0 ] || { echo "install.sh: needs root (the owner's window)" >&2; exit 1; }
if [ "$uninstall" = 1 ]; then
  run systemctl disable --now di-stage-watch.service
  run rm -f "$units/di-stage-watch.service" "$units/di-stage-watch-recheck@.service" "$units/di-stage-watch-recheck@.timer" "$rules/90-di-stage-watch.rules" "$defaults"
  run systemctl daemon-reload
  run udevadm control --reload
  echo "uninstalled. Kept: /var/log/di-stage-watch (the record), /var/lib/di-stage-watch (the cut ledger: run 'watch.mjs undo' first if anything is cut)."
  exit 0
fi
args="--usb-mode $mode"; [ -n "$venue" ] && args="$args --venue $venue"
if [ "$dry" = 1 ]; then echo "would write $defaults: DI_STAGE_WATCH_ARGS=\"$args\""; else printf 'DI_STAGE_WATCH_ARGS="%s"\n' "$args" > "$defaults"; fi
put "$here/systemd/di-stage-watch.service" "$units/di-stage-watch.service"
put "$here/systemd/di-stage-watch-recheck@.service" "$units/di-stage-watch-recheck@.service"
put "$here/systemd/di-stage-watch-recheck@.timer" "$units/di-stage-watch-recheck@.timer"
put "$here/systemd/90-di-stage-watch.rules" "$rules/90-di-stage-watch.rules"
run systemctl daemon-reload
run udevadm control --reload
run systemctl enable --now di-stage-watch.service
echo "stage watch: usb $mode. Undo it all: sudo $here/install.sh --uninstall"
