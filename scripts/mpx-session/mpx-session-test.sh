#!/usr/bin/env bash
# scripts/mpx-session/mpx-session-test.sh — try the MPX session on a free VT, return by itself.
# Run as root:  di-ask "MPX session test" -- sudo scripts/mpx-session/mpx-session-test.sh
# Starts Xorg on VT $TESTVT with mpx-session-start.sh (openbox + 2 xterms, touchpad = 2nd real cursor)
# for $DURATION s, then chvt back. Hyprland keeps running. Undo/return: Ctrl+Alt+F<your VT>.
set -euo pipefail
DURATION=${DURATION:-90}
TESTVT=${TESTVT:-5}
DISP=${DISP:-:9}
HERE=$(cd "$(dirname "$0")" && pwd)
export MPX_LOG=${MPX_LOG:-/tmp/mpx-session.log}
export MPX_DURATION=$DURATION

if [ "${1:-}" = "--dry-run" ]; then
  echo "plan: Xorg $DISP on vt$TESTVT for ${DURATION}s running $HERE/mpx-session-start.sh, log $MPX_LOG"; exit 0
fi
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 2; }
for t in Xorg xinit xinput xterm openbox fgconsole chvt; do
  command -v "$t" >/dev/null || { echo "missing: $t"; exit 3; }
done
BACK=$(fgconsole)
[ "$BACK" != "$TESTVT" ] || { echo "already on vt$TESTVT; pick another TESTVT"; exit 4; }
: > "$MPX_LOG"
echo "start from vt$BACK at $(date +%T)" | tee -a "$MPX_LOG"
timeout "${TIMEOUT:-$((DURATION + 25))}" xinit "$HERE/mpx-session-start.sh" -- /usr/bin/Xorg "$DISP" "vt$TESTVT" -keeptty -nolisten tcp \
    >>"$MPX_LOG.xorg" 2>&1 || true
chvt "$BACK" || true
echo "== back on vt$BACK at $(date +%T)" | tee -a "$MPX_LOG"
chmod 644 "$MPX_LOG" "$MPX_LOG.xorg" 2>/dev/null || true
