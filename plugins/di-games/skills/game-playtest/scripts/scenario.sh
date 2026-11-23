#!/usr/bin/env bash
# scenario.sh <abs path of the TEST .rbxl> <outdir> <tag> [max_wait_s=900]
# The driver of skill game-playtest. It does three things only: start Studio (Vinegar) on the claimed agent screen, send F5 (Play) to the
# window found by OUR OWN process tree, and read "TEST " lines from Studio's log until "TEST DONE". No click by screen coordinates, no
# command bar, no client-side bot. Writes <outdir>/<tag>-events.txt (the TEST/TRIAL lines) and three pictures. Stops Studio by PID tree.
# Needs: DI_AGENT_SCREEN_ID=<n> (claim a screen; item 22 of the brief template), di-agent-screen, xdotool via it, flatpak Vinegar.
# The test place comes from the game's scripts/build-test.sh (it holds tests/place/ScenarioRunner.server.luau). Never a shipped place.
set -u
[ $# -ge 3 ] || { echo "usage: DI_AGENT_SCREEN_ID=<n> scenario.sh <abs .rbxl> <outdir> <tag> [max_wait_s]" >&2; exit 2; }
RBXL="$1"; OUT="$2"; TAG="$3"; MAXW="${4:-900}"
[ -n "${DI_AGENT_SCREEN_ID:-}" ] || { echo "scenario.sh: set DI_AGENT_SCREEN_ID to the screen this job claimed" >&2; exit 2; }
[ -f "$RBXL" ] || { echo "scenario.sh: $RBXL not found" >&2; exit 2; }
export DI_AGENT_SCREEN_ID
SCREEN_W="${SCREEN_W:-2560}"; SCREEN_H="${SCREEN_H:-1400}"
LOGDIR="${STUDIO_LOG_DIR:-$HOME/.var/app/org.vinegarhq.Vinegar/data/vinegar/appdata/Roblox/logs}"
AS=di-agent-screen; X() { "$AS" exec "$@"; }; ts() { date +%T; }
mkdir -p "$OUT"; MARK="$OUT/$TAG.mark"; : > "$MARK"
GPU_ENV="--env=DXVK_FILTER_DEVICE_NAME=NVIDIA --env=VK_ICD_FILENAMES=/usr/lib/x86_64-linux-gnu/GL/vulkan/icd.d/nvidia_icd.json"
pgrep -A -f RobloxStudioBeta >/dev/null 2>&1 && { echo "another Studio is running: not touching"; exit 3; }
# The claimed screen must be empty (a shared screen once swallowed typed text and lost 4 runs).
n=$(X xdotool search --onlyvisible --name . 2>/dev/null | wc -l)
[ "$n" -eq 0 ] || { echo "screen $DI_AGENT_SCREEN_ID has $n visible windows: claim an empty one"; exit 3; }
command -v di-cool >/dev/null 2>&1 && di-cool >/dev/null 2>&1
WINPATH="Z:$(echo "$RBXL" | tr '/' '\\')"
# shellcheck disable=SC2086
"$AS" exec flatpak run --branch=stable --arch=x86_64 --command=vinegar $GPU_ENV org.vinegarhq.Vinegar "$WINPATH" > "$OUT/$TAG-studio.out" 2>&1 &
PID=$!; echo "[$(ts)] launcher pid $PID"
mypids() { echo "$PID $(pstree -p "$PID" 2>/dev/null | grep -o '([0-9]*)' | tr -d '()' | tr '\n' ' ')"; }
stop_studio() {
  local pids; pids="$(mypids)"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null; echo "[$(ts)] stopped"
}
trap stop_studio EXIT
pickwin() { local p w best="" area=0 g a; for p in $(mypids); do for w in $(X xdotool search --pid "$p" --name "Roblox Studio" 2>/dev/null); do
  g=$(X xdotool getwindowgeometry --shell "$w" 2>/dev/null); a=$(( $(echo "$g" | sed -n 's/^WIDTH=//p') * $(echo "$g" | sed -n 's/^HEIGHT=//p') ))
  [ "$a" -gt "$area" ] && { area=$a; best=$w; }; done; done; echo "$best"; }
LOG() { find "$LOGDIR" -type f -name '*Studio*.log' -newer "$MARK" 2>/dev/null | head -1; }
t0=$(date +%s); W=""
while [ $(( $(date +%s) - t0 )) -lt 240 ]; do sleep 5; W=$(pickwin)
  [ -n "$W" ] && { n=$(X xdotool getwindowname "$W"); case "$n" in *" - Roblox Studio"*|*"$(basename "$RBXL" .rbxl)"*) sleep 30; break ;; esac; }
  kill -0 "$PID" 2>/dev/null || { echo "launcher exited"; break; }; done
[ -z "$W" ] && { echo "no Studio window"; exit 2; }
X xdotool windowmove "$W" 0 0 windowsize "$W" "$SCREEN_W" "$SCREEN_H"; sleep 4
X xdotool windowactivate --sync "$W"; sleep 1
"$AS" shot "$OUT/$TAG-1-loaded.png" >/dev/null 2>&1
sendF5() { X xdotool windowactivate --sync "$W"; sleep 1; X xdotool key --clearmodifiers F5; }
sendF5; echo "[$(ts)] F5 sent (window $W)"
for _ in $(seq 1 12); do sleep 5; grep -a -q 'TEST START' "$(LOG)" 2>/dev/null && break; done
if ! grep -a -q 'TEST START' "$(LOG)" 2>/dev/null; then echo "[$(ts)] no TEST START after 60 s: F5 again"; X xdotool key Escape; sleep 1; sendF5; fi
t1=$(date +%s); shot=0
while [ $(( $(date +%s) - t1 )) -lt "$MAXW" ]; do sleep 10
  grep -a -q 'TEST DONE' "$(LOG)" 2>/dev/null && break
  if [ $shot = 0 ] && grep -a -q 'TEST START' "$(LOG)" 2>/dev/null; then sleep 20; "$AS" shot "$OUT/$TAG-2-running.png" >/dev/null 2>&1; shot=1; fi
  kill -0 "$PID" 2>/dev/null || { echo "Studio exited"; break; }
done
"$AS" shot "$OUT/$TAG-3-end.png" >/dev/null 2>&1
grep -a -E 'TEST |TRIAL ' "$(LOG)" | sed 's/^.*\(TEST \|TRIAL \)/\1/' | cut -c1-220 > "$OUT/$TAG-events.txt"
echo "[$(ts)] events: $(wc -l < "$OUT/$TAG-events.txt") lines"; grep -a '^TEST' "$OUT/$TAG-events.txt" | head -30
grep -a -q '^TEST DONE' "$OUT/$TAG-events.txt" || { echo "no TEST DONE: the run is LOST, not passed"; exit 1; }
! grep -a -q '^TEST .* FAIL' "$OUT/$TAG-events.txt"
