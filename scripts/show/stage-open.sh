#!/usr/bin/env bash
# stage-open.sh: open the stage page and the Perform tool in ONE browser, and place both windows (Hyprland 0.57).
#
#   scripts/show/stage-open.sh --space platina --project platina-screen --stage-ws 2 --tool-ws 1 \
#       --base http://diiii.localhost [--preset show:no-laser] [--dry-run]
#
# What it does, in order (this is what was done by hand before):
#   1. ONE Chromium (flatpak org.chromium.Chromium) on its own profile, remote debugging on 9224, --app=<stage URL>
#      stage URL = <base>/<space>/map/<project>/out   (the Projection "out" page: the wall)
#   2. a SECOND WINDOW of the SAME browser (same profile = same process: the phone camera allows one reader per
#      process) with --new-window --app=<perform URL>     perform URL = <base>/<space>/perform/<project>
#   3. the stage window goes to the stage workspace and fullscreen; the tool window goes to the tool workspace,
#      is made floating, then resized and moved (a tiled window ignores resize/move) .
# Windows are found by comparing `hyprctl clients -j` before and after each launch (needs jq).
#
# Nothing is closed or killed. Undo: close the two windows. --dry-run prints every command and runs none of them.
# Agents must NOT run this for real: it opens windows on the owner's desktop (use --dry-run).
set -euo pipefail

space=platina; project=platina-screen; stage_ws=2; tool_ws=1; base=http://diiii.localhost; preset=
tool_x=80; tool_y=60; tool_w=1036; tool_h=837
port=9224; profile="${HOME}/.local/state/di/out-profile"; dry=0

usage() {
  cat <<'USAGE'
usage: stage-open.sh [--space S] [--project P] [--stage-ws N] [--tool-ws N] [--base URL]
                     [--preset ID] [--tool-geometry X,Y,W,H] [--dry-run] [--help]
  --space          space id                     (default platina)
  --project        project slug                 (default platina-screen)
  --stage-ws       workspace for the stage page (default 2); the window is fullscreened there
  --tool-ws        workspace for Perform        (default 1); floated, resized, moved
  --base           base URL of di.iiii          (default http://diiii.localhost)
  --preset         Perform preset id, added as ?preset= to the tool address (default: none, the show's own default)
  --tool-geometry  X,Y,W,H of the Perform window (default 80,60,1036,837)
  --dry-run        print every command, run none
Opens: <base>/<space>/map/<project>/out (stage) and <base>/<space>/perform/<project> (tool), one Chromium, port 9224.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --space) space=$2; shift 2;;
    --project) project=$2; shift 2;;
    --stage-ws) stage_ws=$2; shift 2;;
    --tool-ws) tool_ws=$2; shift 2;;
    --base) base=${2%/}; shift 2;;
    --preset) preset=$2; shift 2;;
    --tool-geometry) IFS=, read -r tool_x tool_y tool_w tool_h <<<"$2"; shift 2;;
    --dry-run) dry=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "stage-open: unknown argument: $1" >&2; usage >&2; exit 2;;
  esac
done
case "$stage_ws$tool_ws" in *[!0-9]*) echo "stage-open: workspaces must be numbers" >&2; exit 2;; esac

stage_url="$base/$space/map/$project/out"
tool_url="$base/$space/perform/$project"
[ -n "$preset" ] && tool_url="$tool_url?preset=${preset//:/%3A}"
chromium=(flatpak run org.chromium.Chromium "--user-data-dir=$profile" "--remote-debugging-port=$port" --no-first-run --hide-crash-restore-bubble)

run() { if [ "$dry" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }
eval_hl() { run hyprctl eval "$1"; }

addresses() { hyprctl clients -j | jq -r '.[].address' | sort; }
# wait up to 30 s for a window that was not in $1 (one address per line); prints its address
new_window() {
  local before=$1 i found
  for i in $(seq 1 60); do
    found=$(comm -13 <(printf '%s\n' "$before") <(addresses) | head -n1)
    [ -n "$found" ] && { printf '%s' "$found"; return 0; }
    sleep 0.5
  done
  echo "stage-open: no new window within 30 s" >&2; return 1
}

if [ "$dry" = 0 ]; then
  command -v jq >/dev/null || { echo "stage-open: jq is needed" >&2; exit 1; }
  command -v hyprctl >/dev/null || { echo "stage-open: hyprctl is needed (Hyprland)" >&2; exit 1; }
  mkdir -p "$profile"
else
  echo "# dry run: nothing is executed"
  echo "+ mkdir -p $profile"
fi

# 1. stage window
if [ "$dry" = 1 ]; then
  printf '+ %s --app=%s &\n' "${chromium[*]}" "$stage_url"
  stage_addr=0xSTAGE
else
  before=$(addresses)
  "${chromium[@]}" "--app=$stage_url" >/dev/null 2>&1 &
  stage_addr=$(new_window "$before")
fi

# 2. tool window, same browser
if [ "$dry" = 1 ]; then
  printf '+ %s --new-window --app=%s &\n' "${chromium[*]}" "$tool_url"
  tool_addr=0xTOOL
else
  before=$(addresses)
  "${chromium[@]}" --new-window "--app=$tool_url" >/dev/null 2>&1 &
  tool_addr=$(new_window "$before")
fi

# 3. placement
eval_hl "hl.dispatch(hl.dsp.window.move({ workspace = $stage_ws, window = 'address:$stage_addr', follow = false }))"
eval_hl "hl.dispatch(hl.dsp.window.fullscreen({ window = 'address:$stage_addr' }))"
eval_hl "hl.dispatch(hl.dsp.window.move({ workspace = $tool_ws, window = 'address:$tool_addr', follow = false }))"
eval_hl "hl.dispatch(hl.dsp.window.float({ window = 'address:$tool_addr' }))"
eval_hl "hl.dispatch(hl.dsp.window.resize({ x = $tool_w, y = $tool_h, exact = true, window = 'address:$tool_addr' }))"
eval_hl "hl.dispatch(hl.dsp.window.move({ x = $tool_x, y = $tool_y, exact = true, window = 'address:$tool_addr' }))"

echo "stage: $stage_url  (workspace $stage_ws, fullscreen)"
echo "tool:  $tool_url  (workspace $tool_ws, floating ${tool_w}x${tool_h} at $tool_x,$tool_y)"
