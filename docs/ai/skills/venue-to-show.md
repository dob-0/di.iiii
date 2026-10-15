# Venue to show — the creating process, learned once

Skill text, 2026-10-15. The same text is the Claude Code skill `venue-to-show` in di-atlas (`skills/venue-to-show/SKILL.md`).
The owner, 2026-10-15 14:4x: *"why we not learned the creating process? … a month working on MOXIR and it still like idiot."*
This file is that process for any venue: from the first measurement to a version shown to him, each step a command or a Studio
feature that exists in di.iiii, or a ledger row for the one that does not. **Read it before any venue, rig, look or show job.
Never re-derive what is written here; if a step here is wrong, fix this file in the same branch as the work that proved it.**

Words (`docs/ai/vocabulary.md`): **place** = the real hall · **scene** = the 3D place · **look** = one lighting state
(`rigLooks.looks[]`) · **cue** = one entry of the cue list (`mappingState.cues[]`; the UI calls them "scenes") · **the scenes
file** = the designed looks with their cue timing, one JSON per show. MOXIR (Charentsavan, 17 Oct 2026) is the worked example,
never a special case: no command below takes a production name in its defaults.

## 0. Start every job here (5 minutes, not an evening)

1. Where does the newest version stand? Run the step check on it. It reads the project document and names the next step:
   ```
   python3 -I scripts/place/venue_to_show_check.py --api http://127.0.0.1:4337/serverXR --project <space>-vX-Y \
       --off-dmx <types not on DMX, e.g. ext-lc-ultra-mk2>        # or --doc <saved document.json>
   ```
   Exit 0 = every step present; 1 = a step MISSING (it prints the command for it); 2 = unreadable. OWED rows never fail.
2. Read `ledger-open` (today's asks) and the last session note `docs/ai/sessions/feat-<venue>-*.md`. Nothing else.
3. One worktree, one scratch stack, one test-browser lane for the job (`di-dev up <tree> --api scratch`, name `<space>-test`
   only for that space's show work). The data stack of a show (MOXIR: `moxir-one`) belongs to its lead; agents read it,
   and write to it only through the commands below with a backup first.
4. A fresh tree needs `npm ci` and `npm --prefix serverXR ci` before `di-dev up`. A scratch stack starts EMPTY: create the space
   (`curl -XPOST -H 'content-type: application/json' -d '{"slug":"<space>","label":"<Label>","allowEdits":true}' <scratch api>/api/spaces`),
   then carry the version before it: `copy_project.mjs --from-api <data api> --to-api <scratch api> --space <s> --from <prev> --backup <dir> --apply`
   (without the space it answers `404 Space not found`; v2.12 proof, N811.19).

## 1. The steps

Every write to a project is: **backup → dry run → `--apply` → read back the count**. A new version starts as a copy of the one
before it (`copy_project.mjs`), never as an edit of it.

| # | step | input | command / feature | output | check | the owner's look |
|---|---|---|---|---|---|---|
| 1 | venue measure | his photos + video (di.bo inbox `/mnt/data/footage/inbox/<date>/`), a **map pin** (ask first), the rental list (xlsx) | `photo_meta.py` (EXIF → intrinsics, GPS, NOAA sun) · `vggt_poses.py` / `reconstruct.py` (VGGT, CC BY-NC weights) · OSM Overpass footprint (ODbL) · `aerial_measure.py`, `crane_height.py`, `fit_plane.py` · building standard ratios (Soviet hall: GOST 23838-89 spans 18/24/30, pitch 6/12) | `scripts/place/rigs/<venue>-hall-dims-<date>.json` + `-features-<date>.json`: every number = value, range, method, confidence | three methods agree within the stated range | the model beside his photos, element by element, on **his** picture from the audience |
| 2 | hall model | dims + features | `python3 scripts/place/hall.py` (parametric Blender) → `node scripts/place/import.mjs --replace` (first time) or `swap-hall.mjs` (a new hall under an existing rig) | the hall GLB as one model object; `components.venuePlan` derived, never drawn | `npx vitest run scripts/place/hall-*.test.js`; step check row "hall model" | walk the room page `/<space>/p/<project>` |
| 3 | rig | the rental list, makers' pages | fixture types `scripts/place/fixtures/fixtures.json` (maker, source URL, date; GDTF where the licence allows) · `rental.mjs` (rentalList) · a rig file `scripts/place/rigs/<venue>-v<X>-<Y>-<date>.json` · cranes/cut `rehang.mjs`, `mirror-cut.mjs` · cubes `aim_lasers.py --spec` · moves `move_lamps.py` · removals `delete_entities.py` · patch `patch-plan.mjs`, `patch-sheet.mjs`, `safety.mjs` | rig units (`components.fixture`) with DMX universe/address, circuits, power | `npx vitest run scripts/rigbuild scripts/place src/rigbuild` (quote the count); step check rows "rig (units / patch / venue plan)" | the plot `/<space>/plot/<project>`, the cards `/<space>/cards/<project>`, the inventory `/<space>/equipment/<project>` — he picks devices by looking, never from a text list |
| 4 | looks design | the place's vibe (his words, his reference videos, the venue's poster), the rig's parts | the scenes file `scripts/place/rigs/<venue>-scenes-<n>-<date>.json` (each scene: id, cue {fade_s, hold_s}, parts → [colour, level], optional `laser`) · energy `scenes_energy.py --energy <venue>-energy-<date>.json --beams … --floor … --outside …` (run ONCE: a committed scenes file that already carries `energy` per scene is the energy pass; a second run changes levels again, N811.20) · palette audit (k-means in L\*a\*b\* over his frames; tools still in agent-reports, row) | one scenes file in git | `scenes-energy-py.test.js`; `look_energy.py --doc` gives each cue's light in numbers | the scenes sheet (one picture per scene) through `di-show` |
| 5 | scenes → rig looks | scenes file + the hang file (units, solids, stage, haze, camera; once per venue `rig_generate.py hang --rig <last rig> --out <venue>-hang-v<X>-<Y>-<date>.json`) | `python3 -I scripts/place/rig_generate.py build --hang <hang> --scenes <file> --out <rig out> --version X.Y --title "<t>"` (one generator, no builder script per version: decision `docs/ai/decisions/2026-10-15-one-rig-generator.md`; `scenes_to_rig.py` still works on a rig file) | a rig file with `looks` + `cues` | `rig_generate.py check --rig <new> --against <old>` names what changed; `rig-generate-py.test.js` | — |
| 6 | project build | rig out + the copy | `node scripts/place/copy_project.mjs --api … --space <s> --from <prev> --to <new> --title "<t>" --backup <dir> --apply` then `node scripts/rigbuild/epic-build.mjs --api … --project <new> --rig <rig out> --looks-only --apply` | looks, the cue list, loop on, `showEpoch` set; units untouched | step check rows "looks", "cues", "show clock"; read back looks/cues count | — |
| 7 | laser frames | scenes file (`laser` per scene) + rig + hall record | `python3 -I scripts/place/laser_frames.py --scenes … --rig … --hall <the newest scripts/place/rigs/<venue>-hall-*.hall.json> --show-epoch-ms <the project's mappingState.showEpoch, after step 6> --out <rig+frames>` (without the epoch the frames run out of step with the cues, N811.21; `--rig` of epic-build is read relative to the repo root, so give the frames file as a relative path, N811.22) (generated, 3.8 MB: never commit) then `epic-build.mjs … --rig <rig+frames> --laser-frames --apply`; `--laser-lines-only --apply` gives existing lines `beam.laser` | `beam.laser.frames` on every cube line | step check row "laser frames"; `laser-frames-py.test.js` | the room page, Show render, one picture per scene (`scripts/measure/laser-scene-shots.cjs`) |
| 8 | light environment | his pick of an environment | `node scripts/place/apply_light_env.mjs --api … --project <new> --from-project <picked> [--from-api https://dev.diiii.xyz/serverXR] --apply`; the picker sheet `scripts/measure/env-pick-shots.cjs` | `renderSettings.atmosphere`, exposure, bloom, floor surface, fog | step check row "light environment"; mean luma per cue (`look_energy.py`, frame stats) against his example | the environment sheet: he takes one |
| 9 | the standard look | — (code) | render modes **Studio / Tech / Show** (`src/shared/renderPlan.js`, decision `docs/ai/decisions/2026-10-15-studio-tech-show-render.md`); quality **Low / High**; the Studio's lines of light as THE look of the room page (N808/N810, in progress) | nothing in the document (render-time only) | step check rows "standard look" (bloom OK; lines OWED) | the room page in Show beside the Studio, same cue |
| 10 | physics | the built project | `python3 scripts/place/physics_check.py --api … --project <new> --hall <the same .hall.json as step 7>` (0 leaks; `--fix` does not shorten laser lines and fails with HTTP 400 when only lasers leak, and the step check's "beam reach" row does not run this check, N811.23) + `look_shots.cjs` with views from OUTSIDE and from the floor (agent screen, `DI_TEST_LANE=<own>`) | leak count, pictures | 0 leaks; pictures opened and compared | the outside look, before anything else is shown |
| 11 | renders / sheets | the project | `look_shots.cjs` (Studio views) · `cue-frames.mjs --gpu` (one frame per cue, room page) · luma numbers | pictures + a sheet page | every picture opened; numbers beside them | the sheet in his di browser (`di-show <file>`) |
| 12 | the show page | the project | the room page `/<space>/p/<project>` (one 3D page; view bar, Display → Tech, Auto fly, Walk) · publish the project | the public link | `scripts/measure/page-check.cjs` | he opens it; test copy `<space>-test.diiii.localhost/<space>/<slug>` |
| 13 | dev | code on branches, content on the scratch stack | code: task branch → PR → land batch into `dev` → dev deploy (check `/api/health` releaseId) · content: copy the version to dev (`copy-version.mjs --from-api`, `tier-sync --changed`), the owner's word · local follows dev (`di follow`) | dev.diiii.xyz/<space> shows the version | dev and local same commit; `di follows` | `dev.diiii.xyz/<space>` on his screen |
| 14 | the real cubes / DMX | the patch, the frames | desk patch (`patch-plan.mjs`, Light `/light`), MVR `export-mvr.mjs` + `validate-mvr.mjs`, the laser frames sender, the DMX node | light in the hall | a real lamp moves on the cable; cubes draw the frames | the hall on the night |

## 2. Traps already paid for (each cost an evening or more)

- **epic-build's default mode (no `--…-only` flag) deletes and re-creates every unit** from the rig file: hand moves are lost and
  `beam.laser.frames` dropped. Use it only for the FIRST build of a project. After that: `--looks-only`, `--laser-frames`,
  `--laser-lines-only`, `--tag-steel-only`. Written as a lesson at 06:02 on 10-15 (N767); a default-mode run at 06:3x still
  moved all 102 units (found 14:07, N803; restored from the backup). The guard belongs in the tool (row below).
- **`--lasers-only` writes even without `--apply`.** Back up first.
- Units are aimed **by the look** (`rigLooks.looks[].aims`), not by their transform: after moving units, re-run `--looks-only`.
- `load-version` builds from its `--from` project's HALL: a rebuild from an archived project brings an old hall back.
- Confirm a geometric change on **his** picture from the audience before building ("house left" in words flipped the cut, 10-07).
- A dark room is not a setting: Lite carried 4 lamps at ~50 % (now Low/High); read the luma number before calling a look done.
- Light stops at the first surface: every lamp move recomputes reach (`epic-build --hall`) and runs `physics_check.py`.
- The scratch stack needs Node 24: `DI_DEV_NODE=$HOME/.local/opt/node-v24.21.0-linux-x64/bin/node di-dev up <tree> --api scratch`.
- Network lasers (LaserCube) and a hazer run by hand are not on DMX: pass their types to the step check's `--off-dmx`.
- A generated rig with frames (`*.laser-frames.json`) is never committed; regenerate it with `laser_frames.py`.

## 3. The owner's standing choices (defaults — do not ask again)

Platform-wide: quality words **Low / High** (never Full/Lite) · **one 3D page** (the room page) for a show, the Studio for
building · Studio / Tech / Show as three renders of one room · rectangles, 0–2 px corners · addresses `diiii.localhost`
(test copy `<space>-test.diiii.localhost`) · pictures and links before any "merge?" · he picks by looking.
This production (MOXIR, instance data, kept in the space and the scenes file, not in code): the name = մոխիր "ash" (ash grey,
ember, smoke); underground, rare colours, red only as an accent; outside: road `#a5ff0f`, entrance `#e04e00`; lasers never
over the audience, every line ends on steel; the owner's own hand layout and aims are kept (never re-generated over them).

## 4. The measure of success

**A new version (v2.12) of this venue built from this skill by a fresh agent in ≤ 1 hour and ≤ 60 rounds, with the owner's
look at the end**, and `venue_to_show_check.py` on it exiting 0 apart from the rows named as owed. The "before", measured
2026-10-15 (`agent-reports-2026-10-15/moxir-50/creating-process-report.md`): 19 numbered versions (v0.5 → v2.11) in 12 days (10-04 → 10-15), 20 per-version builder
scripts (`scripts/place/moxir_v*.py`), 131 MOXIR rig files, 628 MOXIR ledger rows (327 rows on 10-15 alone), 4 lead
hand-overs in one day.

## 5. What is still outside di.iiii (ledger rows, each a Sonnet job)

The scenes design tools (`scenes50.py`, `palette.py`, `laser_design.py`, `outside_rule.py`, `sheet.py`, `laser_sheet.py`) and the
read-back (`readback.py`) live in `~/work/agent-reports-2026-10-15/moxir-50/` · the light-environment table tools
(`light-env-data/table.py`, `analyze.py`) · a per-version builder script for each version instead of one generator from the
scenes file and a layout file · the epic-build default-mode guard (N767) · one project, several scene sets ("stories", N717) ·
the lines of light as THE look (N808/N810). Rows: N811.1 scenes50 · N811.2 palette audit · N811.3 outside rule · N811.4 laser
design · N811.5 scenes sheet · N811.6 laser sheet · N811.7 energy data · N811.8 light-environment table · N811.9 outside/floor
views · N811.10 one generator · N800.1 read-back · N767 guard · N717 stories (N811.11: the scenes file, moved in this job). close a row by moving the thing into
`scripts/place` with a test and fixing this table.

Migrated (feat/migrate-scenes-2026-10-15): N811.1 `scenes50.py` → `scripts/place/scenes_build.py` (spec → scenes file + check; the colour audit stays with N811.2) · N811.3 → `scenes_outside_rule.py` · N811.4 → `laser_design.py` + `rigs/moxir-laser-design-2026-10-15.json`; test `scripts/place/scenes-tools.test.js`.
