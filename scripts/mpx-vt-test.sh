#!/usr/bin/env bash
# scripts/mpx-vt-test.sh — real X11 MPX test on a free VT (owner N2951/N3030).
# Spec: docs/design/multi-cursor-and-controllers.md (section 5, test 1).
#
# What it does (as root, started by `di-ask ... -- sudo scripts/mpx-vt-test.sh`):
#   1. remembers the VT you are on, starts Xorg on VT $TESTVT with an xterm,
#   2. makes a second master pointer ("Second pointer") and attaches the touchpad to it,
#   3. logs every pointer event per device for $DURATION seconds,
#   4. stops Xorg and switches back to your VT by itself.
# Undo / return: it returns on its own; by hand press Ctrl+Alt+F<your VT>, or `pkill -x Xorg`.
# Nothing is installed or written outside $LOG*. Hyprland is not touched; it keeps running.
set -euo pipefail

DURATION=${DURATION:-90}
TESTVT=${TESTVT:-5}
DISP=${DISP:-:9}
LOG=${LOG:-/tmp/mpx-vt-test.log}

plan() {
  cat <<EOF
mpx-vt-test plan: Xorg $DISP on vt$TESTVT for ${DURATION}s, log $LOG (+ .events, .xorg),
create-master Second, reattach the touchpad to "Second pointer", then back to the starting VT.
EOF
}

if [ "${1:-}" = "--dry-run" ]; then plan; exit 0; fi
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 2; }
for t in Xorg xinit xinput xterm fgconsole chvt; do
  command -v "$t" >/dev/null || { echo "missing: $t"; exit 3; }
done

BACK=$(fgconsole)
[ "$BACK" != "$TESTVT" ] || { echo "already on vt$TESTVT; pick another TESTVT"; exit 4; }
: > "$LOG"; : > "$LOG.events"; : > "$LOG.xorg"
plan | tee -a "$LOG"
echo "start from vt$BACK at $(date +%H:%M:%S)" | tee -a "$LOG"

CLIENT=$(mktemp /tmp/mpx-client.XXXXXX)
cat > "$CLIENT" <<EOF
#!/usr/bin/env bash
exec >>"$LOG" 2>&1
echo "== list before"; xinput list --short
xinput create-master Second; echo "create-master exit=\$?"
sleep 1
echo "== list after create"; xinput list --short
TP=\$(xinput list --short | grep -i touchpad | grep -vi dualsense | grep -oE 'id=[0-9]+' | head -1 | cut -d= -f2 || true)
echo "touchpad slave id=\${TP:-none}"
if [ -n "\${TP:-}" ]; then xinput reattach "\$TP" "Second pointer"; echo "reattach exit=\$?"; fi
echo "== list after reattach"; xinput list --short
xinput test-xi2 --root > "$LOG.events" 2>&1 &
XI=\$!
xterm -geometry 70x10+40+40 -e "echo 'Two cursors: mouse moves cursor 1, touchpad moves cursor 2.'; echo 'Move both for ${DURATION}s. It returns by itself.'; sleep ${DURATION}" &
sleep ${DURATION}
kill \$XI 2>/dev/null || true
EOF
chmod 755 "$CLIENT"

# hard stop a little after the test; chvt back whatever happens
timeout "$((DURATION + 25))" xinit "$CLIENT" -- /usr/bin/Xorg "$DISP" "vt$TESTVT" -keeptty -nolisten tcp >>"$LOG.xorg" 2>&1 || true
chvt "$BACK" || true
rm -f "$CLIENT"

{
  echo "== events per device (count of 'device:' lines in the XI2 log)"
  grep -E '^[[:space:]]*device:' "$LOG.events" | sort | uniq -c | sort -rn | head -8 || true
  echo "== back on vt$BACK at $(date +%H:%M:%S)"
} | tee -a "$LOG"
chmod 644 "$LOG" "$LOG.events" "$LOG.xorg"
