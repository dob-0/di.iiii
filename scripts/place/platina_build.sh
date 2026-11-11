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
echo "OK: base checked, rig, hang and rig-with-scenes written"
