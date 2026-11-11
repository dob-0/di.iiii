#!/usr/bin/env bash
# phone-camera.sh — the phone's camera as a camera source on this machine, by cable or by wifi.
#
#   phone-camera.sh run [--link auto|cable|wifi] [--wifi IP:PORT] [--device /dev/videoN] [--facing back|front] [--size WxH]
#   phone-camera.sh status
#
# One phone gives ONE camera feed at a time (measured 2026-11-11, SM-S921B: a second feed ends the first), so
# cable and wifi are two links to the same source, not two sources. `auto` (default) takes the cable whenever the
# phone is plugged in and falls back to wifi when it is not; when the link in use drops it picks again within 3 s.
# Needs adb, scrcpy and a v4l2loopback device (default /dev/video10). Runs until stopped (Ctrl+C / SIGTERM).
set -u
link=auto; wifi="${DI_PHONE_WIFI:-}"; device=/dev/video10; facing=back; size=1920x1080
cmd="${1:-status}"; shift || true
while [ $# -gt 0 ]; do case "$1" in
    --link) link="$2"; shift 2;; --wifi) wifi="$2"; shift 2;; --device) device="$2"; shift 2;;
    --facing) facing="$2"; shift 2;; --size) size="$2"; shift 2;;
    *) echo "phone-camera: unknown option $1" >&2; exit 2;; esac; done
state="${XDG_RUNTIME_DIR:-/tmp}/di-phone-camera.link"
cable_serial() { adb devices | awk 'NR>1 && $2=="device" && $1 !~ /:/ {print $1; exit}'; }
wifi_serial() { [ -n "$wifi" ] || return 0; adb connect "$wifi" >/dev/null 2>&1; adb -s "$wifi" get-state 2>/dev/null | grep -q device && echo "$wifi" || adb disconnect "$wifi" >/dev/null 2>&1; }
pick() {
    local s=""
    case "$link" in
        cable) s="$(cable_serial)"; [ -n "$s" ] && echo "cable $s";;
        wifi) s="$(wifi_serial)"; [ -n "$s" ] && echo "wifi $s";;
        auto) s="$(cable_serial)"; if [ -n "$s" ]; then echo "cable $s"; else s="$(wifi_serial)"; [ -n "$s" ] && echo "wifi $s"; fi;;
        *) echo "phone-camera: --link is auto, cable or wifi" >&2; exit 2;;
    esac
}
case "$cmd" in
    status) if [ -s "$state" ] && pgrep -f "scrcpy .*--v4l2-sink=$device" >/dev/null; then echo "feeding $device by $(cat "$state")"; else echo "not feeding"; fi;;
    run)
        [ -e "$device" ] || { echo "phone-camera: $device is missing (v4l2loopback)" >&2; exit 1; }
        trap 'rm -f "$state"; exit 0' INT TERM
        while true; do
            read -r how serial < <(pick; echo) || true
            if [ -n "${serial:-}" ]; then
                echo "$(date +%H:%M:%S) feed start by $how ($serial)"; echo "$how" > "$state"
                scrcpy -s "$serial" --video-source=camera --camera-facing="$facing" --camera-size="$size" --no-audio --no-window --v4l2-sink="$device" 2>&1 | grep -v "Camera capture failed" | tail -3
                echo "$(date +%H:%M:%S) feed ended ($how)"; rm -f "$state"
            fi
            sleep 3
        done;;
    -h|--help) sed -n 2,11p "$0";;
    *) echo "phone-camera: run | status" >&2; exit 2;;
esac
