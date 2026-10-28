## 2026-10-20 — rig checks made real (ledger N224)

- `di_rig_check` listed tie-off, inside-hall and laser-lantern as `unavailable` (owed since #810). The geometry already
  lived in `scripts/rigbuild/safety.mjs` (moved out of #772's tests); only the wiring and the lantern rule were missing.
- Added to `safety.mjs`: `lanternFailures` (beam must rise to the deck, land on solid deck, land > 1 m from every other
  beam; computed from the lamp's position and aim), `outsideHallLines`, `hallMissing`. The tests now call these, so tool and tests share one rule.
- `sdk/rig.js` runs per version: `tieoffClash`, `insideHall`, `laserLantern` (pass/fail with reasons; `n/a` when the version has no
  tie-offs/lasers; `unavailable` with the missing hall keys when a hall lacks them). Lamps via `laserLampsOf` (all laser models).
- Still `unavailable`: `tieoffRating` — tie-offs hold prose only, no `rated_kg`, no anchor capacity in any hall. Owed from the rigger.
- Sources: audit 2026-10-05 A-02/A-03/A-10 (PR #772); 3 m floor as in laser-distance.mjs. The 1 m beam-spread rule is a project rule, UNVALIDATED.
- Tests: can-fail cases for each (wall pulled in, lantern/flat/converging beams, existing cab segment case); Known · full passes on its committed hall.
