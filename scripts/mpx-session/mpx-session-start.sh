#!/usr/bin/env bash
# scripts/mpx-session/mpx-session-start.sh — X11 MPX session: mouse and touchpad are TWO REAL cursors.
# Run as the X session's client (xinit / display manager), NOT inside Hyprland.
# Owner N3328/N3335: a real second cursor (select text at once), not the Hyprland overlay.
# Spec: docs/design/multi-cursor-and-controllers.md, route A.
#   ./mpx-session-start.sh            normal session: openbox + 2 xterms
#   MPX_DURATION=90 ...               test mode: ends by itself after 90 s (used by mpx-session-test.sh)
set -u
LOG=${MPX_LOG:-/tmp/mpx-session.log}
exec >>"$LOG" 2>&1
echo "== mpx-session start $(date +%T)"

# second master pointer, then give it the touchpad (the mouse stays on "Virtual core pointer")
xinput create-master Second
sleep 1
TP=$(xinput list --short | grep -i touchpad | grep -vi dualsense | grep "slave *pointer" \
     | sed -n 's/.*id=\([0-9]*\).*/\1/p' | head -1)
echo "touchpad slave id: ${TP:-none}"
[ -n "${TP:-}" ] && xinput reattach "$TP" "Second pointer"
xinput list --short

xsetroot -solid '#000000'
openbox &
sleep 1
# xft font (-fa) avoids the core-font "cannot load font" failure seen in the VT5 test
xterm -fa Monospace -fs 14 -geometry 70x20+40+40 -title "mouse side" &
xterm -fa Monospace -fs 14 -geometry 70x20+700+40 -title "touchpad side" &

if [ -n "${MPX_STRESS:-}" ]; then
    STRESS_SECONDS=${MPX_DURATION:-30} python3 -I "$(dirname "$0")/mpx-stress.py"
    echo "== stress over, exit=$?"
    python3 -I "$(dirname "$0")/mpx-gaps.py"
    echo "== gaps over, exit=$?"; exit 0
fi
if [ -n "${MPX_DURATION:-}" ]; then
    sleep "$MPX_DURATION"
    echo "== test time over, ending session"
    exit 0
fi
wait
