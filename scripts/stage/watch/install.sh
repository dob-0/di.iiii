#!/usr/bin/env bash
# scripts/stage/watch/install.sh — put the stage watch on a show machine (root: the owner's window, in daylight).
#   install.sh [--dry-run] [--venue FILE] [--usb-mode warn|cut] [--show-status URL|FILE]   write the units, the udev rule, the defaults; start it
#   install.sh --uninstall [--dry-run]                             stop it and remove them (the record and the cut ledger stay)
# Cut mode fails closed: it needs --venue FILE whose watch.usb.protected names what must never be cut (the DMX dongle, the
# show's controllers), every entry a device on the bus now (`watch.mjs check`, the check the watch makes at its start).
# --show-status is where the watch reads the laser stops: serverXR's local route at its default port (serverXR/src/config.js:
# PORT, else 4000) unless given; a source that does not answer is a WARN line in events.log. --sys-root DIR: tests only.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dry=0; uninstall=0; venue=""; mode="warn"; show_status="http://127.0.0.1:4000/show-status"; sys_root="/"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    --venue) venue="$2"; shift ;;
    --usb-mode) mode="$2"; shift ;;
    --show-status) show_status="$2"; shift ;;
    --sys-root) sys_root="$2"; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
case "$mode" in warn|cut) ;; *) echo "install.sh: --usb-mode is warn or cut" >&2; exit 2 ;; esac
# A made-up tree checks a made-up bus: never let it stand in for the real one in a real install.
[ "$sys_root" = / ] || [ "$dry" = 1 ] || { echo "install.sh: --sys-root (a made-up tree, for tests) needs --dry-run" >&2; exit 2; }
node="$(command -v node || true)"
[ -n "$node" ] || { echo "install.sh: node is not on PATH" >&2; exit 1; }
if [ "$uninstall" = 0 ] && [ "$mode" = cut ]; then
  if [ -z "$venue" ]; then
    echo "install.sh: cut mode needs --venue FILE whose watch.usb.protected names what must never be cut (the DMX dongle, the show's controllers); nothing was installed" >&2
    exit 2
  fi
  # Every entry read and found on the bus (verify C2): a list that names nothing is refused by entry, never counted.
  if ! why="$("$node" "$here/watch.mjs" check --venue "$venue" --sys-root "$sys_root" 2>&1)"; then
    printf 'install.sh: %s; nothing was installed\n' "$why" >&2
    exit 2
  fi
fi
units=/etc/systemd/system; rules=/etc/udev/rules.d; defaults=/etc/default/di-stage-watch
run() { if [ "$dry" = 1 ]; then echo "would run: $*"; else "$@"; fi; }
put() {
  if [ "$dry" = 1 ]; then echo "would write $2"; sed -e "s|@NODE@|$node|g" -e "s|@WATCH_DIR@|$here|g" "$1" | grep -E '^(Exec|ACTION|Unit=|OnActive|SuccessExit)' | sed 's/^/    /'
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
args="--usb-mode $mode"
[ -n "$venue" ] && args="$args --venue $venue"
[ -n "$show_status" ] && args="$args --show-status $show_status"
if [ "$dry" = 1 ]; then echo "would write $defaults: DI_STAGE_WATCH_ARGS=\"$args\""; else printf 'DI_STAGE_WATCH_ARGS="%s"\n' "$args" > "$defaults"; fi
put "$here/systemd/di-stage-watch.service" "$units/di-stage-watch.service"
put "$here/systemd/di-stage-watch-recheck@.service" "$units/di-stage-watch-recheck@.service"
put "$here/systemd/di-stage-watch-recheck@.timer" "$units/di-stage-watch-recheck@.timer"
put "$here/systemd/90-di-stage-watch.rules" "$rules/90-di-stage-watch.rules"
run systemctl daemon-reload
run udevadm control --reload
run systemctl enable --now di-stage-watch.service
echo "stage watch: usb $mode, laser stops from $show_status. Undo it all: sudo $here/install.sh --uninstall"
