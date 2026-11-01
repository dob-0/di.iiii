#!/usr/bin/env bash
# model_hall.sh <work_dir> [samples] - one command: plan.json -> textures -> hall.blend/.glb -> gate renders.
# <work_dir> holds plan.json and sits next to the frames folder (../images), as the place recipe lays it out.
# Undo: delete <work_dir>/{textures,renders,hall.blend,hall.glb,place.json}; plan.json and DIMENSIONS.md are the inputs.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); w=$(cd "$1" && pwd); n=${2:-128}; imgs=${IMAGES:-$w/../images}
python3 "$here/rectify.py" "$w/plan.json" "$imgs" "$w/textures"
python3 "$here/props_textures.py" "$w/plan.json" "$imgs" "$w/textures"
blender -b --factory-startup --python "$here/build_hall.py" -- "$w/plan.json" "$w/textures" "$w" 2>&1 | grep -E 'BUILT|Error|Traceback'
blender -b --factory-startup "$w/hall.blend" --python "$here/check_glb.py" -- "$w/hall.glb" "$w/plan.json" 2>&1 | grep -E 'GLB|FAIL|Traceback'
blender -b --factory-startup --python "$here/write_place.py" -- "$w/hall.glb" "$w/plan.json" "$w/place.json" 2>&1 | grep -E 'PLACE|Error|Traceback'
blender -b "$w/hall.blend" --python "$here/render_views.py" -- "$w/plan.json" "$w/renders" "$n" 2>&1 | grep -E 'RENDERED|Error|Traceback'
"$here/compare.sh" "$w/plan.json" "$imgs" "$w/renders"
