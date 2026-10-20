#!/bin/bash
# laser-look-gpu-chain.sh — the owed GPU look of the lasers (2026-10-15, job 3 hand-over). Run from the worktree with the
# lasers-look scratch stack up. after-lasers (this tree) -> HdrBloom swapped to the pre-#958 bloom path (lasers inside the
# glow) -> before-lasers, before-lamps -> restored.
# Then: laser-lines-measure.py per shots.json, picture-diff.py after-lamps vs before-lamps (< 0.5 %), before-after-sheet.py.
# BEFORE_HDRBLOOM = git show decae48f^:src/project/viewport/HdrBloom.jsx with the DEV handle { scene, gl, camera, controls }.
cd "$(git rev-parse --show-toplevel)" || exit 1
export DI_TEST_LANES=3 DI_TEST_LANE=2 PATH=$HOME/.local/opt/node-v24.21.0-linux-x64/bin:$PATH
O=${OUT:?}; CAM='{"position":[0,1.7,19.8],"target":[0,3,4.8],"fov":60}'
c="--base http://lasers-look.diiii.localhost --space moxir --project moxir-v2-11 --camera $CAM --wait-s 3600"
L="--scene the-storm:rig-the-storm:124 --scene green-breath:rig-green-breath:198"
run() { timeout 4000 di-test-browser run scripts/measure/laser-scene-shots.cjs $c "$@" 2>&1 | tail -3; echo "rc=$?"; }
mkdir -p "$O"; echo "== after-lamps"; run --pages room --frame-mode no-lasers --scene second-drop:rig-second-drop:212 --out $O/after-lamps
echo "== after-lasers"; run --pages room $L --out $O/after-lasers
cp src/project/viewport/HdrBloom.jsx "$O/HdrBloom.head.jsx"
cp "${BEFORE_HDRBLOOM:?}" src/project/viewport/HdrBloom.jsx; sleep 5
echo "== before-lasers"; run --pages room $L --out $O/before-lasers
echo "== before-lamps"; run --pages room --frame-mode no-lasers --scene second-drop:rig-second-drop:212 --out $O/before-lamps
cp "$O/HdrBloom.head.jsx" src/project/viewport/HdrBloom.jsx
git diff --quiet -- src/project/viewport/HdrBloom.jsx && echo "restored" || echo "RESTORE: HdrBloom differs from HEAD"
echo "== chain done"
