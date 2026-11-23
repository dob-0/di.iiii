#!/usr/bin/env bash
# screen-record-key.sh — what a desktop key runs: toggle the recording of the given screens and say so in a notification.
#   screen-record-key.sh eDP-1 DP-3
set -u
here="$(dirname "$(readlink -f "$0")")"
out="$("$here/screen-record.sh" toggle "$@" 2>&1)"; rc=$?
if [ $rc -ne 0 ]; then title="Recording FAILED"; elif grep -q '^saved:' <<<"$out"; then title="Recording stopped"; else title="Recording started"; fi
command -v notify-send >/dev/null && notify-send -a "di record" "$title" "$out"
echo "$title"; echo "$out"; exit $rc
