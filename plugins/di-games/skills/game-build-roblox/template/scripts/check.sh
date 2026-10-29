#!/usr/bin/env bash
# All checks, in order. Needs the tools: run scripts/setup-tools.sh once first.
# Stops at the first failure and says which step failed. Last line on success: "ALL CHECKS PASSED".
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
T=scripts/tools.sh

step() { echo; echo "==> $*"; }

step "tools: installed binaries match tools.sha256"
python3 -I scripts/verify_tools.py

step "greybox: map files match map/plan.json"
python3 -I scripts/gen_greybox.py --check

step "assets: every row of assets.csv is valid and its licence allowed (an asset with no row is the verifier's gate, skill game-look)"
python3 -I scripts/check_assets.py

step "json: every .json parses"
python3 -I -c "
import json, pathlib
files = [p for p in pathlib.Path('.').rglob('*.json') if '.git' not in p.parts and 'build' not in p.parts]
for p in files:
    json.loads(p.read_text())
print(len(files), 'json files parse')"

step "stylua --check"
$T stylua --check src tests tests.luau scripts/check_place.luau scripts/check_no_test_code.luau

step "selene"
$T selene src tests tests.luau scripts/check_place.luau scripts/check_no_test_code.luau

step "rojo build"
mkdir -p build
$T rojo build default.project.json -o build/__PROJECT_NAME__.rbxl

step "place: the BUILT place holds the map where the plan says (round trip, origin, spawn, scripts)"
# Born from a real bug: Rojo ignored "Position", every part sat at (0, 0, 0) and the tests (which read the JSON) passed.
$T lune run scripts/check_place build/__PROJECT_NAME__.rbxl

step "place: the shipped place holds no test-only code (scenario runners live in tests/place/ and in the test place only)"
$T lune run scripts/check_no_test_code build/__PROJECT_NAME__.rbxl
scripts/build-test.sh

step "negative: a map placed with Position must FAIL check_place, a test place must FAIL check_no_test_code"
scripts/negative_gate_test.sh

step "luau-lsp: type check src against the Roblox API (pinned definitions)"
source scripts/roblox-types.env
TYPES="${ROBLOX_TYPES_DIR:-$HOME/tools/roblox-types}/globalTypes.None.d.luau"
[[ -f "$TYPES" ]] || { echo "FAIL: $TYPES is missing; run scripts/setup-types.sh once"; exit 1; }
echo "$ROBLOX_TYPES_SHA256  $TYPES" | sha256sum -c --quiet || { echo "FAIL: $TYPES is not the pinned file"; exit 1; }
$T rojo sourcemap default.project.json --output build/sourcemap.json
$T luau-lsp analyze --definitions="$TYPES" --sourcemap=build/sourcemap.json src

step "lune tests"
if ! OUT="$($T lune run tests 2>&1)"; then
  echo "$OUT"
  echo "FAIL: lune tests"
  exit 1
fi
echo "$OUT"
# A gate that passes with zero tests is no gate: demand "N passed, 0 failed" with N > 0.
echo "$OUT" | grep -E -q '^[1-9][0-9]* passed, 0 failed$' || { echo "FAIL: the test run did not report 'N passed, 0 failed' with N > 0"; exit 1; }

echo
echo "ALL CHECKS PASSED"
