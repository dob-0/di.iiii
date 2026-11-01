#!/usr/bin/env bash
# model_floor.sh <modelled_dir> [samples] - one command: the rooms of a floor (each built by hand, in the shared floor frame)
# -> floor.glb/.blend -> sense check -> place.json -> gate renders. Nothing here names a place: everything comes from
# <modelled_dir>: floor.json (rooms + openings), floor_assembly.json (modules, drops, clips, offsets),
# floor_corrections.json (decisions on proposed corrections; optional), place_meta.json (spawn, scale note; optional).
# REBUILD=1 first runs each module's own "build" command from the manifest (modules without one are used as they are).
# Undo: delete <modelled_dir>/{floor.glb,floor.blend,assembly_report.json,place.json,check_floor.log,renders/floor_top.png,renders/eye_*.png}
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); w=$(cd "$1" && pwd); n=${2:-32}
man=$w/floor_assembly.json; corr=$w/floor_corrections.json; [ -f "$corr" ] || corr=
if [ -n "${REBUILD:-}" ]; then
  python3 - "$man" "$w" <<'PY' | while IFS=$'\t' read -r dir cmd; do (cd "$dir" && bash -c "$cmd" 2>&1 | grep -E 'BUILT|Error|Traceback' || true); done
import json, os, sys
m = json.load(open(sys.argv[1])); base = os.path.join(sys.argv[2], m.get('root', '.'))
for x in m['modules']:
    if x.get('build'): print(os.path.dirname(os.path.join(base, x['glb'])) + '\t' + x['build'])
PY
fi
blender -b --factory-startup --python "$here/assemble_floor.py" -- "$man" "$w" 2>&1 | grep -E 'MODULE|ASSEMBLED|Error|Traceback'
blender -b --factory-startup --python "$here/check_floor.py" -- "$w/floor.glb" "$w/floor.json" "$man" $corr 2>&1 | grep -E 'BELOW|FLOORS|OPENING|SEALED|WARN|FAIL|FLOOR_OK|Error|Traceback' | tee "$w/check_floor.log"
grep -q FLOOR_OK "$w/check_floor.log"
meta=$w/place_meta.json; [ -f "$meta" ] || meta=$w/floor.json
blender -b --factory-startup --python "$here/write_place.py" -- "$w/floor.glb" "$meta" "$w/place.json" "$w/floor.json" 2>&1 | grep -E 'PLACE|VIEWPOINT|Error|Traceback'
mkdir -p "$w/renders"
blender -b "$w/floor.blend" --python "$here/render_floor.py" -- "$w/floor.json" "$man" "${corr:--}" "$w/renders" "$n" 2>&1 | grep -E 'RENDERED|Error|Traceback'
