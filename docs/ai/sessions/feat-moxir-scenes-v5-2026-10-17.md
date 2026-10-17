# MOXIR scenes v5 — washes and beams, lasers at 0 (2026-10-17, show day)

**Ask (owner 08:2x):** *"we need to for wash and beams; lasers we will update in future when it will be ready."* Earlier: ask the
light agents what is checked, pick from the last scenes and their analysis, write cool scenes.

**What was on hand (read first, no research):** the 50 scenes v3-palette3 + lasers v4 (`scripts/place/rigs/moxir-scenes-50-2026-10-17.json`),
their plan/compile (`~/work/agent-reports-2026-10-17/plan-v4.json`), the laser chain audit of 07:5x, the venue-to-show skill.
Agents' answers (08:0x–08:1x): **laser** — six cubes lit at the whole field, 40 W lines untouched, scene file handed to me;
**beam** — every U1 and U2 lamp checked at the venue (place, address, colour match the 3D), U1.353 deleted, pan corrections in the
document (v564+, `deskLookValues` applies them), 40 W lasers + smoke under test, beam colours only from `B380F_WHEEL_SEEN`, no beam at
eye level into the audience, lasers at 0 unless the owner signs off, the live desk held by beam.

## What changed (v3 → v5), measured
| item | v3 | v5 | how measured |
|---|---|---|---|
| beam colours on the wheel | 8 of 12 hexes used on the 18 beams are NOT a slot of the seen wheel (#73bdff #66faff #8f73ad #26bcff #ff9180 #d1eeff #f4fcf4 #33ff47 → the desk's nearestSlot picks something else) | 11 slots only: open, warm white, light blue, lime, green, amber, orange, magenta, red (blue banned by the eye rule) | `B380F_SLOTS_SEEN`, fixtureTypes.js; count over parts plane 1 / side line L / R |
| head patterns | nod 18, wave 12, circle 5, figure8 4, none 11 | fan 11, sweep 6, cross 7, circle 8, figure8 5, nod 7, wave 6 — every scene moves or stands in a shape | headMotion.js HEAD_PATTERNS |
| head peak speed | — | ≤ 86 °/s (the-storm, second-drop), tilt ≤ 30° | headPeakSpeed formula |
| eye-level safety | — | all 18 beams rest straight UP in the show document (v603, rotation [π,0,0]); a 30° lean stays 60° above the floor line | document read 08:4x |
| eye rules (palette.py) | — | 0 violations; red in 5 scenes (≤ 6), never on the floor; strobes S ≤ 0.25 | audit script in the session scratchpad |
| flash | — | strobe 3/s (engine cap); sparkle moved to 33 bpm (= 3 flashes/s worst; 132 bpm gave 8); bars ≤ 132 bpm | flashrate.cjs on fx.js |
| energy | pass-4 curve | same curve kept: 25 full / 14 mid / 11 low, mean 0.70 | scenes_energy.py |
| lasers | `laser` part 0.16 in 22 scenes | `laser` part absent in all 50 (level 0); the v4 design kept under `laser_parked` | file |
| cue timing | loop 1266 s | unchanged | scenes_build.py --check |
| rig | v2.11 | v2.12 = rig_generate.py build from the v2.11 hang; 67 units, 50 looks, 50 cues | rig_generate.py check: DIFFER looks only |
| physics | — | 0 leaks / 97 beams on the scratch copy (hall 2026-10-07) | physics_check.py |
| tests | — | scenes-tools, scenes-energy-py, rig-generate-py, headMotion: 35/35 | vitest |

Design in one line per act: 1 doors — light blue and open columns, slow fans and sweeps; 2 the poster — lime and green chases, the
walls answer; 3 the peak — open white pumps, mirrored crosses, ONE red room; 4 breakdown — the rare colours (magenta, amber, deep sea),
slow circles and one slow figure-eight; 5 second peak and the way out — open and warm white, red twice, ice strobes.
Periods sit on the 132 bpm bar (1.82 s): 2, 4, 8 or 16 bars.

## Where it lives
- scenes: `scripts/place/rigs/moxir-scenes-50-v5-2026-10-17.json` · rig: `scripts/place/rigs/moxir-v2-12-2026-10-17.json` (branch `feat/moxir-scenes-v5-2026-10-17`)
- scratch copy: `http://scenes-v5.diiii.localhost/moxir/moxir-v2-12` (stack scenes-v5, api 127.0.0.1:4371; copied from the installed di's moxir-v2-11 @ v604)
- generator: session scratchpad `scenes_v5.py` (design table → file). OWED: fold the table into `scenes_build.py` spec form (nothing left behind).

## Not done / owed
- Not applied to the show document or dev: waits for the owner's look (rule: merge needs proof; beam holds the live desk).
- Step check on the scratch copy: 11/13 — "rig (patch)" 61/62 (U1.353 deleted at the venue, not a scene matter) and "laser frames" 36/38 (the two 40 W lines, lasers later) are not v5's.
- The v3 beam-colour finding (8 hexes off the wheel) also holds for the show's CURRENT v2.11 looks: ledger row.
