#!/usr/bin/env bash
# live-log-timer.sh — run live-log.mjs every 2 minutes on this machine (systemd user timer), or take it away.
#   scripts/production/live-log-timer.sh install <project> <chat id> [tier]   # e.g. what-we-have -1004449920523 dev
#   scripts/production/live-log-timer.sh remove  <project>
#   scripts/production/live-log-timer.sh status  <project>
# Unit name: di-live-log-<project>. Logs: journalctl --user -u di-live-log-<project>
set -euo pipefail
main() {
if [[ "${*: -1}" == "--dry-run" ]]; then set -- "${@:1:$#-1}"; echo "dry run: would $1 systemd user timer di-live-log-$2 (every 2 min: live-log.mjs --project $2 --chat ${3:-?} --tier ${4:-dev}) in ~/.config/systemd/user; nothing changed"; return 0; fi
cmd=${1:?install|remove|status}; project=${2:?project id}; unit="di-live-log-${project}"
dir="$HOME/.config/systemd/user"; here="$(cd "$(dirname "$0")" && pwd)"
case "$cmd" in
  install)
    chat=${3:?telegram group id}; tier=${4:-dev}; node="$(command -v node)"
    mkdir -p "$dir"
    cat > "$dir/$unit.service" <<UNIT
[Unit]
Description=di live log: $project follows Telegram group $chat ($tier)
[Service]
Type=oneshot
ExecStart=$node $here/live-log.mjs --project $project --chat $chat --tier $tier
TimeoutStartSec=300
UNIT
    cat > "$dir/$unit.timer" <<UNIT
[Unit]
Description=di live log every 2 minutes: $project
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT
    systemctl --user daemon-reload && systemctl --user enable --now "$unit.timer" && systemctl --user list-timers "$unit.timer" --no-pager | head -2 ;;
  remove)
    systemctl --user disable --now "$unit.timer" 2>/dev/null || true
    rm -f "$dir/$unit.service" "$dir/$unit.timer"; systemctl --user daemon-reload; echo "removed $unit" ;;
  status)
    systemctl --user list-timers "$unit.timer" --no-pager | head -2; journalctl --user -u "$unit" -n 5 --no-pager -o cat ;;
  *) echo "usage: $0 install|remove|status <project> [chat] [tier]" >&2; exit 2 ;;
esac
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
