#!/usr/bin/env bash
# k2-browser-access.sh — let the Flatpak Chromium see hardware MIDI controllers (the Xone:K2).
#
#   k2-browser-access.sh status    what the sandbox may read now, and which MIDI ports Linux sees
#   k2-browser-access.sh on        give the browser READ-ONLY access to the device list (/run/udev)
#   k2-browser-access.sh off       undo: take that access away again
#   add --dry-run to on/off to see the command without changing anything
#
# Why: Chromium's Web MIDI finds hardware ports through udev. The Flatpak sandbox has /dev/snd (devices=all)
# but no /run/udev, so the page lists only "Midi Through" and never the K2 (measured 2026-11-11, N3621).
# The change is a per-user Flatpak override; it takes effect the next time the browser starts.
set -euo pipefail
APP=org.chromium.Chromium
ACCESS=/run/udev:ro

show() {
    echo "sandbox override for $APP:"
    flatpak override --user --show "$APP" | sed 's/^/  /'
    echo "MIDI ports Linux sees:"
    amidi -l | sed 's/^/  /'
}

main() {
local dry=0 args=()
for a in "$@"; do [[ $a == --dry-run ]] && dry=1 || args+=("$a"); done
set -- "${args[@]}"
if (( dry )); then
    echo "dry run, nothing is changed. It would run:"
    case "${1:-status}" in
        on) echo "  flatpak override --user --filesystem=$ACCESS $APP" ;;
        off) echo "  flatpak override --user --nofilesystem=$ACCESS $APP" ;;
        *) echo "  (status only, no change)" ;;
    esac
    show; return 0
fi
case "${1:-status}" in
    status) show ;;
    on)
        echo "before:"; show
        flatpak override --user --filesystem="$ACCESS" "$APP"
        echo "after:"; show
        echo "done. The browser must be restarted once to see the controller. Undo: $0 off"
        ;;
    off)
        flatpak override --user --nofilesystem="$ACCESS" "$APP"
        show
        echo "undone. Restart the browser for it to take effect."
        ;;
    *) echo "usage: $0 status|on|off" >&2; exit 2 ;;
esac
}

[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
