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
$T stylua --check src tests tests.luau

step "selene"
$T selene src tests tests.luau

step "rojo build"
mkdir -p build
$T rojo build default.project.json -o build/__PROJECT_NAME__.rbxl

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
