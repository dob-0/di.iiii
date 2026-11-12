#!/usr/bin/env bash
# The Platina light chain in one command, from the repo root: base -> rig -> hang -> rig with scenes.
# It stops at the FIRST step that fails and prints that step's own exit code (2026-11-11 lesson: an exit code read
# from `tail` hid a failed step twice, and a later step then built on a stale file).
# Use: scripts/place/platina_build.sh [--base <manuals dir>]   (--base also re-imports the makers' manuals into the library)
set -euo pipefail
cd "$(dirname "$0")/../.."
step() { echo "== $*"; "$@" || { rc=$?; echo "FAILED rc=$rc: $*" >&2; exit "$rc"; }; }
if [ "${1:-}" = "--base" ]; then
    step python3 -I scripts/place/fixtures/import_platina_manuals.py --manuals "${2:?--base needs the manuals directory}"
    step node scripts/rigbuild/types.mjs
fi
step node scripts/rigbuild/types.mjs --check
step python3 -I scripts/place/platina_rig.py --repo .
step python3 -I scripts/place/platina_hang.py
step python3 -I scripts/place/rig_generate.py build --hang scripts/place/rigs/platina-hang-2026-11-11.json \
    --scenes scripts/place/rigs/platina-scenes-2026-11-11.json --out scripts/place/rigs/platina-rig-scenes-2026-11-11.json \
    --version 1.1 --title "Platina - Live in Yerevan: rig plan with the 22 light scenes"
# v3 (owner 2026-11-11, N3745/N3759): the scene set per kept screen look, effects and the stress block. The 22-scene rig above stays.
step python3 -I scripts/place/platina_scenes_v3.py
step python3 -I scripts/place/scenes_build.py --spec scripts/place/rigs/platina-scenes-spec-v3-2026-11-12.json --out scripts/place/rigs/platina-scenes-v3-2026-11-12.json
step node scripts/place/scenes_flash.cjs scripts/place/rigs/platina-scenes-v3-2026-11-12.json
step python3 -I scripts/place/rig_generate.py build --hang scripts/place/rigs/platina-hang-2026-11-11.json \
    --scenes scripts/place/rigs/platina-scenes-v3-2026-11-12.json --out scripts/place/rigs/platina-rig-scenes-v3-2026-11-12.json \
    --version 3.1 --title "Platina - Live in Yerevan: rig plan with the v3 light scenes"
# the 30 s light piece to the track's opening (owner N3752): v3 scenes cut to the measured times
step python3 -I scripts/place/platina_piece.py
step python3 -I scripts/place/scenes_build.py --check scripts/place/rigs/platina-piece-rok-n-roller-2026-11-12.json
step node scripts/place/scenes_flash.cjs scripts/place/rigs/platina-piece-rok-n-roller-2026-11-12.json
step python3 -I scripts/place/rig_generate.py build --hang scripts/place/rigs/platina-hang-2026-11-11.json \
    --scenes scripts/place/rigs/platina-piece-rok-n-roller-2026-11-12.json --out scripts/place/rigs/platina-rig-piece-rok-n-roller-2026-11-12.json \
    --version 3.1 --title "Platina - Live in Yerevan: the 30 s light piece"
echo "OK: base checked, rig, hang, rig-with-scenes (22), rig-with-scenes v3 and the 30 s piece written"
