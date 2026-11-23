#!/usr/bin/env bash
# screen-record.sh — record several screens at once (the Perform UI and the stage output), one file per screen.
#
#   screen-record.sh start [--out DIR] [SCREEN ...]   default screens: every active one (hyprctl monitors)
#   screen-record.sh stop                             ends every recording this script started, prints the files
#   screen-record.sh toggle [...]                     start when idle, stop when recording (for one key)
#   screen-record.sh status
#
# Uses wf-recorder with the GPU encoder (h264_vaapi on DI_RECORD_DEVICE, default /dev/dri/renderD128);
# DI_RECORD_CODEC=libx264 falls back to the CPU. Files: DIR/<stamp>-<screen>.mp4, DIR defaults to ~/Videos/di-record.
# No sound is recorded. Undo: `screen-record.sh stop`; the files are plain mp4, delete them by hand.
set -euo pipefail
state="${XDG_RUNTIME_DIR:-/tmp}/di-screen-record"
codec="${DI_RECORD_CODEC:-h264_vaapi}"; device="${DI_RECORD_DEVICE:-/dev/dri/renderD128}"
die() { echo "screen-record: $*" >&2; exit 1; }
running() { [ -d "$state" ] && for p in "$state"/*.pid; do [ -e "$p" ] && kill -0 "$(cat "$p")" 2>/dev/null && return 0; done; return 1; }
status() { if running; then echo "recording:"; cat "$state"/*.file; else echo "not recording"; fi; }
stop() {
    running || { echo "not recording"; rm -rf "$state"; return 0; }
    for p in "$state"/*.pid; do kill -INT "$(cat "$p")" 2>/dev/null || true; done
    for _ in $(seq 50); do running || break; sleep 0.2; done
    running && die "a recorder did not stop: $(cat "$state"/*.pid | tr '\n' ' ')"
    echo "saved:"; for f in "$state"/*.file; do ls -lh "$(cat "$f")" | awk '{print "  " $5 "  " $NF}'; done
    rm -rf "$state"
}
start() {
    running && die "already recording (screen-record.sh stop)"
    command -v wf-recorder >/dev/null || die "wf-recorder is not installed"
    local dir="$HOME/Videos/di-record"; local screens=()
    while [ $# -gt 0 ]; do case "$1" in --out) dir="$2"; shift 2;; *) screens+=("$1"); shift;; esac; done
    [ ${#screens[@]} -gt 0 ] || mapfile -t screens < <(hyprctl monitors -j | python3 -c "import json,sys; [print(m['name']) for m in json.load(sys.stdin)]")
    [ ${#screens[@]} -gt 0 ] || die "no screen found"
    mkdir -p "$dir" "$state"; local stamp; stamp="$(date +%Y-%m-%d_%H-%M-%S)"
    for s in "${screens[@]}"; do
        local f="$dir/$stamp-$s.mp4"; local args=(-o "$s" -f "$f" -c "$codec")
        [ "$codec" = h264_vaapi ] && args+=(-d "$device")
        setsid wf-recorder "${args[@]}" >"$state/$s.log" 2>&1 &
        echo $! >"$state/$s.pid"; echo "$f" >"$state/$s.file"
    done
    sleep 1.5
    for s in "${screens[@]}"; do kill -0 "$(cat "$state/$s.pid")" 2>/dev/null || { tail -3 "$state/$s.log" >&2; stop >/dev/null || true; die "recorder for $s did not start"; }; done
    echo "recording ${screens[*]} into $dir (stop: screen-record.sh stop)"
}
case "${1:-status}" in
    start) shift; start "$@";;
    stop) stop;;
    toggle) shift; if running; then stop; else start "$@"; fi;;
    status) status;;
    -h|--help) sed -n 2,11p "$0";;
    *) die "unknown: $1 (start|stop|toggle|status)";;
esac
