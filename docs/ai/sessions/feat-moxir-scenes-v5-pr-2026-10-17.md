# MOXIR scenes v6 — washes and beams, underground; lasers = the laser session's v5, unchanged (2026-10-17, show day)

**Asks.** Owner 08:0x: ask the light agents what is checked, pick from the last scenes and their analysis, write cool scenes.
08:2x: *"we need to for wash and beams; lasers we will update in future when it will be ready."* 09:0x on v5: *"lol now its color
full make back underground plz and resume."* 09:4x: *"laser cubes in 3d not visible and also open raw that i can see whats going on and when you finish scenes also open that."*

**On hand (read first, no research):** the 50 scenes v3-palette3 + lasers v4 (`moxir-scenes-50-2026-10-17.json`, laser's branch), the
plan/compile of v4, the laser chain audit (07:5x), the venue-to-show skill (§3: *underground, rare colours, red only as an accent*).
**Agents (08:0x–08:1x):** laser — six cubes lit at the whole field, the 40 W lines untouched, the scene file handed over. beam — every U1
and U2 lamp checked at the venue, U1.353 deleted, pan corrections in the document (v564+), 40 W + smoke under test, beam colours only
from `B380F_WHEEL_SEEN`, no beam at eye level, lasers 0 unless the owner signs off, the live desk held by beam.

## v6 = the accepted colours + the moves that really move; the lasers untouched
| item | v3 (accepted) | v6 | measured by |
|---|---|---|---|
| wash colours and levels, floor, outside | palette 3 | the same, part for part | file diff |
| beam colours | 12 hexes, 8 of them not a slot of the seen wheel (the desk's nearest slot picks another colour) | the seen slots only: open white 58 · light blue 24 · green 10 · warm white 8 · red 4 (scene-part uses); map in `beam_wheel_seen` | `B380F_SLOTS_SEEN` |
| head moves | nod 18 · wave 12 · circle 5 · figure8 4 · none 11 | nod 18 · wave 10 · circle 9 · figure8 6 · none 7; periods on the 132 bpm bar where v5's move was kept | `heads_check.mjs`: 43 moving looks, every one turns its beams 15–25°, 0 still |
| flashes | 0 over 3/s | 0 over 3/s (4 sparkle scenes keep v3's motion) | `scenes_flash.cjs` |
| eye rules | — | red in 3 scenes, never on the floor; strobes carry no colour over HSV S 0.25 (key and kicker hold ash in strobes) | palette.py eye() |
| lasers | v4 design: `laser` part 0.16 in 22 scenes | the laser session's CURRENT design (v5: whole field, levels 1.0), identical in 50/50 scenes; my v5 and first v6 had dropped them (owner 09:4x "laser cubes in 3d not visible"), my second v6 had v4 (would have rolled their work back) | file diff against their file (copy in agent-reports-2026-10-17/moxir-scenes-v6/inputs) |
| energy, cue timing | pass-4 curve, loop 1266 s | unchanged | scenes_build.py --check |
| physics | — | 0 leaks / 97 beams on the scratch copy | physics_check.py |
| rig | v2.11 | v2.12 = rig_generate.py build from the v2.11 hang (67 units, 50 looks, 50 cues) | rig_generate.py |
`intent` is now the scene in plain words from its data; `intent_v3` keeps the v3 story. Generator: `docs/moxir/scenes-v6-2026-10-17/scenes_v6.py`.

## What went wrong, and the change that stops it next time (learn once)
1. **v5 went colourful** (lime, magenta, amber, orange on the beams). It broke a WRITTEN standing choice (skill §3) — the worst kind of
   failure. Change: `scenes_build.py --check` refuses any part colour outside the file's own `palette[]` / `beam_wheel_seen` (v5 fails, v6 passes; test).
2. **A flash claim read off a table by eye** ("sparkle at 33 bpm = 3/s"; it is 4). Change: `scenes_flash.cjs` measures every scene of a file at
   its own tempo on fx.js and exits 1 over the limit (test).
3. **Pan-only moves on upright beams turned nothing** (24 scenes). Change: `heads_check.mjs` plays every look through the room's own
   headMotion.js and measures the turn of each beam; under 3° = STILL, exit 1 (test). The sheet tool now names every head move (test).
4. **Pictures:** `laser-scene-shots.cjs` holds a cue only in the browser copy, and the room page follows the DESK, so all its pictures showed the
   same stored look. The right tool is `env-pick-shots.cjs` with a desk loaded by `show-loop.mjs --no-start`; it needs an env from `lightEnvOf`
   (a rig env file crashes it) and, when killed, it leaves its held cue on the desk (restored by hand here from the saved list). Owed row.

## Where it lives
- scenes `scripts/place/rigs/moxir-scenes-50-v6-2026-10-17.json` · rig `scripts/place/rigs/moxir-v2-12-2026-10-17.json`
- scratch copy `http://scenes-v5.diiii.localhost/moxir/p/moxir-v2-12` (stack scenes-v5, its desk offline: ARTNET_OFFLINE=1, output off)
- not applied to the show document, the live desk or dev: waits for the owner's pick (beam holds the live desk).
5. **"Lasers later" read as "lasers at 0".** He meant: leave the lasers as they are, they get updated later. Dropping them made the cubes vanish
   from the 3D. Lesson kept here and in memory: a scope word ("later", "not now") leaves a thing as it is; it never removes it.
6. **Taking a file from another session's branch at the moment I branched** gave me their v4 lasers while they already ran v5. Before landing
   anything that carries another session's part, re-read THEIR current file and compare (here: 22 scenes differed). Their message 10:1x caught it.
