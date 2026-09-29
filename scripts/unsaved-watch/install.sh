#!/usr/bin/env bash
# The daily "only on this machine" watch, for Linux (systemd user timer).
#
#   scripts/unsaved-watch/install.sh [folder...]     # default: ~/work
#   scripts/unsaved-watch/install.sh --uninstall
#
# Copies scripts/unsaved.mjs + unsaved-lib.mjs into ~/.local/share/di/unsaved (so the
# watch never depends on which branch a checkout happens to be on, or on a worktree
# that gets removed), writes di-unsaved.service + .timer into ~/.config/systemd/user,
# and enables the timer. Every day at 18:00 (or at the next boot if the machine was
# off) it lists work that has sat only on this machine for more than 24 hours:
#   - a desktop notification when there is any
#   - the full list appended to ~/.local/state/di/unsaved.log   ← the one place to look
#   - `systemctl --user status di-unsaved` shows the last run
# Run it again after pulling a newer di.iiii to refresh the copy. CONTRIBUTING.md
# "Every hand, one flow".
set -euo pipefail

UNIT_DIR="$HOME/.config/systemd/user"
APP_DIR="$HOME/.local/share/di/unsaved"
LOG="$HOME/.local/state/di/unsaved.log"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == --uninstall ]]; then
  systemctl --user disable --now di-unsaved.timer 2>/dev/null || true
  rm -f "$UNIT_DIR/di-unsaved.service" "$UNIT_DIR/di-unsaved.timer"
  systemctl --user daemon-reload
  rm -rf "$APP_DIR"
  echo "  di-unsaved: removed (the log stays at $LOG)"
  exit 0
fi

# systemd user units don't get the login shell's PATH, so node is pinned by absolute path.
NODE="$(command -v node || true)"
[[ -x "$NODE" ]] || { echo "  di-unsaved: node not found on PATH — install Node 20+ first" >&2; exit 1; }

FOLDERS=("$@")
[[ ${#FOLDERS[@]} -gt 0 ]] || FOLDERS=("$HOME/work")
for f in "${FOLDERS[@]}"; do [[ -d "$f" ]] || { echo "  di-unsaved: no such folder: $f" >&2; exit 1; }; done

mkdir -p "$APP_DIR" "$UNIT_DIR" "$(dirname "$LOG")"
cp "$SRC/unsaved.mjs" "$SRC/unsaved-lib.mjs" "$APP_DIR/"
printf 'Copied from %s at %s, %s.\nDo not edit here — edit scripts/ in di.iiii and re-run scripts/unsaved-watch/install.sh.\n' \
  "$SRC" "$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(date -Is)" > "$APP_DIR/SOURCE.txt"

quoted=""; for f in "${FOLDERS[@]}"; do quoted+=" \"$f\""; done
cat > "$UNIT_DIR/di-unsaved.service" <<UNIT
[Unit]
Description=List work that lives only on this machine (di.iiii "Every hand, one flow")
Documentation=file://$APP_DIR/SOURCE.txt

[Service]
Type=oneshot
ExecStart="$NODE" "$APP_DIR/unsaved.mjs" --older-than 24 --notify --log "$LOG"$quoted
# 1 = "something is only here" — a finding, not a failure; it is in the log and the
# notification. 2 = a repo could not be read, which does mark the unit failed.
SuccessExitStatus=1
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=600
UNIT

cat > "$UNIT_DIR/di-unsaved.timer" <<UNIT
[Unit]
Description=Daily: list work that lives only on this machine

[Timer]
OnCalendar=*-*-* 18:00
# A laptop is often off at 18:00; the missed day still runs at the next boot.
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now di-unsaved.timer >/dev/null
echo "  di-unsaved: on — daily 18:00 over:${quoted}"
echo "  log: $LOG   run now: systemctl --user start di-unsaved   undo: $0 --uninstall"
