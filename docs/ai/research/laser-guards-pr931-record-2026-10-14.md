# Laser guards: record of PR #931 (2026-10-14, ledger N641.4)

PR: https://github.com/dob-0/di.iiii/pull/931 (feat/laser-guards-2026-10-14 to dev; build commit ae1ba1ac, review round 2 commit 089295e3). Status when written: not merged.
Sources: agent reports laser-guards-build.md and laser-guards-review.md (2026-10-14). The full reports are not pasted here; the PR holds the code and review thread.

## What it is
Server-side path guards in serverXR (`serverXR/src/laser/laserGuards.js`, pure) so every frame source is protected: step limit (Chebyshev, lit 0.025 / blank 0.1 field units a point at 30 kpps, scaled by 30000/rate), corner dwell, blanking, and the numbers behind them come from the research notes beside this file (Wicked Lasers, nannou, ofxLaser, OpenLase, Helios, TouchDesigner).

## Measured (on the PR's commits, per the reports)
- Review run: `npx vitest run serverXR/src/laser serverXR/src/laserShutdownContracts.test.js`: 3 files, 69 passed.
- A 2000-point lit zig-zag became 172,000 points = a 5.73 s pass at 30 kpps; 6 simulated cubes ticked in 138-267 ms. These are the review's headline findings (ranked by harm in the review).

## Unvalidated
- Shutdown/resume byte sequence (0x8d, park points, 0x80) is not yet rehearsed on a fake cube or real cube.
- Nothing was seen on the real wall; the owner arms cubes in the Laser Out window.

## Why it matters for the workflow
The decision record 2026-10-14-raw-laser-workflow.md relies on it: guards live on the server; no graph node can arm or loosen one.
