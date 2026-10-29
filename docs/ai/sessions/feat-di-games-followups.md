## 2026-10-29 — di-games follow-ups: scenario tests, no-test-code gate, negative gate test, release steps

- `game-playtest`: the scripted-scenario method (a test-only server runner prints `TEST <case> PASS|FAIL <numbers>` and `TEST DONE n/m`; the driver `scripts/scenario.sh` only starts Play and reads Studio's log; agent screen claimed by id), and what failed (coordinate clicks, client-side bots, uncalibrated models).
- Roblox template: `tests/place/ScenarioRunner.server.luau` skeleton, `scripts/build-test.sh`, `scripts/check_no_test_code.luau`, `scripts/negative_gate_test.sh` (a map placed with `Position` must fail `check_place`), all wired into `check.sh`.
- `game-release`: Studio's publish fields (the owner's decisions), private confirmation, Sober link form, `release-template.md`.
- Tested: new-game.sh into a scratch dir, `scripts/check.sh` ALL CHECKS PASSED; `claude plugin validate` passes. Not run in Studio.
- Still undone: running the ScenarioRunner skeleton and scenario.sh in a real Studio on a new game.
