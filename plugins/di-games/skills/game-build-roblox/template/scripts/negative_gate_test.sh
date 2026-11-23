#!/usr/bin/env bash
# Proves the built-place gates COUNT: each gate must FAIL on a place made wrong on purpose. A gate that cannot fail is no gate.
#  1. a map placed with "Position" (the Rojo trap: Rojo drops it, every part lands at the origin) must make check_place FAIL;
#  2. a place holding a ScenarioRunner must make check_no_test_code FAIL.
# Works on a full copy in build/negative (removed at the end); nothing shipped is touched.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
T=scripts/tools.sh
W=build/negative
rm -rf "$W"; mkdir -p build
# A full copy of the game, so the tools run inside it (tools.sh works from the game root, check_place reads map/ there).
mkdir "$W"; tar --exclude=./build --exclude=./.git -cf - . | tar -xf - -C "$W"

# 1. Replace the explicit CFrame of every map part by a plain "Position" (what Rojo ignores).
python3 -I - <<'P2'
import json, pathlib
n = 0
def fix(node):
    global n
    props = node.get("Properties", {})
    cf = props.get("CFrame")
    if isinstance(cf, dict) and "CFrame" in cf:
        props["Position"] = cf["CFrame"]["position"]
        del props["CFrame"]
        n += 1
    for c in node.get("Children", []):
        fix(c)
for f in pathlib.Path("build/negative/map").glob("*.model.json"):
    d = json.loads(f.read_text()); fix(d); f.write_text(json.dumps(d))
assert n > 0, "no CFrame found to break: the template changed, fix this test"
print(n, "parts changed to Position")
P2
( cd "$W" && mkdir -p build && scripts/tools.sh rojo build default.project.json -o build/bad.rbxl )
if ( cd "$W" && scripts/tools.sh lune run scripts/check_place build/bad.rbxl ) >"$W/check_place.out" 2>&1; then
  echo "FAIL: check_place PASSED a map placed with Position; the gate does not count"; tail -5 "$W/check_place.out"; exit 1
fi
grep -q '^FAIL' "$W/check_place.out" || { echo "FAIL: check_place exited non-zero but printed no FAIL line"; tail -5 "$W/check_place.out"; exit 1; }
echo "ok    check_place FAILED the Position map, as it must: $(grep -m1 '^FAIL' "$W/check_place.out" | cut -c1-120)"

# 2. The test place holds a ScenarioRunner: check_no_test_code must fail on it.
scripts/build-test.sh >/dev/null
if $T lune run scripts/check_no_test_code build/__PROJECT_NAME__-test-scenario.rbxl >"$W/no_test.out" 2>&1; then
  echo "FAIL: check_no_test_code PASSED a place with a ScenarioRunner"; exit 1
fi
grep -q '^FAIL' "$W/no_test.out" || { echo "FAIL: check_no_test_code gave no FAIL line"; exit 1; }
echo "ok    check_no_test_code FAILED the test place, as it must"
rm -rf "$W"
