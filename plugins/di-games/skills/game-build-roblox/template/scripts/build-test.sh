#!/usr/bin/env bash
# Builds build/__PROJECT_NAME__-test-scenario.rbxl: the shipped game plus tests/place/ScenarioRunner.server.luau, for the playtest driver
# (skill game-playtest, scripts/scenario.sh). The shipped sources and default.project.json are never edited: the copy lives in build/test-src.
# NEVER publish the test place. The shipped place is build/__PROJECT_NAME__.rbxl, and check_no_test_code.luau guards it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
T=scripts/tools.sh
rm -rf build/test-src; mkdir -p build/test-src
cp -r src build/test-src/src
cp -r map build/test-src/map
cp tests/place/ScenarioRunner.server.luau build/test-src/src/server/ScenarioRunner.server.luau
python3 -I - <<'P'
import json
d = json.load(open("default.project.json"))
def fix(n):
    if isinstance(n, dict):
        for k, v in n.items():
            if k == "$path" and isinstance(v, str):
                n[k] = v if v.startswith("/") else "test-src/" + v
            else:
                fix(v)
fix(d["tree"])
d["name"] = d["name"] + "TestScenario"
json.dump(d, open("build/test.project.json", "w"), indent=1)
P
OUTF=build/__PROJECT_NAME__-test-scenario.rbxl
$T rojo build build/test.project.json -o "$OUTF"
echo "built $OUTF (test place: never publish)"
