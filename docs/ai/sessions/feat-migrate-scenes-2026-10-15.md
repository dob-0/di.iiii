# feat/migrate-scenes-2026-10-15

## Scenes tools moved into scripts/place (rows N811.1 N811.3 N811.4, 2026-10-15)


Brief: `agent-reports-2026-10-15/moxir-50/briefs/migrate-scenes.md`. Rule: nothing made for a show is left behind.

| Row | From (agent-reports, `scenes-tools/`) | Now in di.iiii | Venue step |
| --- | --- | --- | --- |
| N811.1 | `scenes50.py` | `scripts/place/scenes_build.py` | venue-to-show step 5 (scenes as data) |
| N811.3 | `outside_rule.py` | `scripts/place/scenes_outside_rule.py` | step 6 (outside look) |
| N811.4 | `laser_design.py` | `scripts/place/laser_design.py` + `scripts/place/rigs/moxir-laser-design-2026-10-15.json` | step 5 (laser design, then `laser_frames.py`) |

- `scenes50.py` held the 50 scenes AS CODE. The scenes are already data in git (`rigs/moxir-scenes-50-2026-10-15.json`), so the generic part moved:
  `scenes_build.py` builds a scenes file from a compact spec (floor strips per act, cue, desk caps, loop) and checks any scenes file.
  Its colour audit half (palette, eye rules, colour mix) depends on `palette.py` — that is row N811.2, another job, not moved here.
- `laser_design.py`: the 21-scene design dict became data (`moxir-laser-design-2026-10-15.json`, source/date inside); the tool takes `--design`
  and validates every entry with `laser_frames.validate_laser` before writing; dry run by default, `--apply` keeps a `.pre-laser.json`.
- `outside_rule.py`: colours and old parts are now required arguments (no production defaults); split axis/value are arguments.
- Test: `scripts/place/scenes-tools.test.js` (8 tests: fixture check, spec round-trip, derivation, bad input, outside rule, laser design apply/clear/refuse).
- Not done: the scenes themselves are not regenerated from a spec (the fixture was edited after `scenes50.py` ran, so its floors are not derivable);
  the one-generator design is N811.10.
