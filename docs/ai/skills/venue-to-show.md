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

## 1. The steps

Every write to a project is: **backup → dry run → `--apply` → read back the count**. A new version starts as a copy of the one
before it (`copy_project.mjs`), never as an edit of it.

| # | step | input | command / feature | output | check | the owner's look |
|---|---|---|---|---|---|---|
| 1 | venue measure | his photos + video (di.bo inbox `/mnt/data/footage/inbox/<date>/`), a **map pin** (ask first), the rental list (xlsx) | `photo_meta.py` (EXIF → intrinsics, GPS, NOAA sun) · `vggt_poses.py` / `reconstruct.py` (VGGT, CC BY-NC weights) · OSM Overpass footprint (ODbL) · `aerial_measure.py`, `crane_height.py`, `fit_plane.py` · building standard ratios (Soviet hall: GOST 23838-89 spans 18/24/30, pitch 6/12) | `scripts/place/rigs/<venue>-hall-dims-<date>.json` + `-features-<date>.json`: every number = value, range, method, confidence | three methods agree within the stated range | the model beside his photos, element by element, on **his** picture from the audience |
| 2 | hall model | dims + features | `python3 scripts/place/hall.py` (parametric Blender) → `node scripts/place/import.mjs --replace` (first time) or `swap-hall.mjs` (a new hall under an existing rig) | the hall GLB as one model object; `components.venuePlan` derived, never drawn | `npx vitest run scripts/place/hall-*.test.js`; step check row "hall model" | walk the room page `/<space>/p/<project>` |
| 3 | rig | the rental list, makers' pages | fixture types `scripts/place/fixtures/fixtures.json` (maker, source URL, date; GDTF where the licence allows) · `rental.mjs` (rentalList) · a rig file `scripts/place/rigs/<venue>-v<X>-<Y>-<date>.json` · cranes/cut `rehang.mjs`, `mirror-cut.mjs` · cubes `aim_lasers.py --spec` · moves `move_lamps.py` · removals `delete_entities.py` · patch `patch-plan.mjs`, `patch-sheet.mjs`, `safety.mjs` | rig units (`components.fixture`) with DMX universe/address, circuits, power | `npx vitest run scripts/rigbuild scripts/place src/rigbuild` (quote the count); step check rows "rig (units / patch / venue plan)" | the plot `/<space>/plot/<project>`, the cards `/<space>/cards/<project>`, the inventory `/<space>/equipment/<project>` — he picks devices by looking, never from a text list |
| 4 | looks design | the place's vibe (his words, his reference videos, the venue's poster), the rig's parts | the scenes file `scripts/place/rigs/<venue>-scenes-<n>-<date>.json` (each scene: id, cue {fade_s, hold_s}, parts → [colour, level], optional `laser`) · energy `scenes_energy.py --energy` · palette audit (k-means in L\*a\*b\* over his frames; tools still in agent-reports, row) | one scenes file in git | `scenes-energy-py.test.js`; `look_energy.py --doc` gives each cue's light in numbers | the scenes sheet (one picture per scene) through `di-show` |
| 5 | scenes → rig looks | scenes file + the hang file (units, solids, stage, haze, camera; once per venue `rig_generate.py hang --rig <last rig> --out <venue>-hang-v<X>-<Y>-<date>.json`) | `python3 -I scripts/place/rig_generate.py build --hang <hang> --scenes <file> --out <rig out> --version X.Y --title "<t>"` (one generator, no builder script per version: decision `docs/ai/decisions/2026-10-15-one-rig-generator.md`; `scenes_to_rig.py` still works on a rig file) | a rig file with `looks` + `cues` | `rig_generate.py check --rig <new> --against <old>` names what changed; `rig-generate-py.test.js` | — |
| 6 | project build | rig out + the copy | `node scripts/place/copy_project.mjs --api … --space <s> --from <prev> --to <new> --title "<t>" --backup <dir> --apply` then `node scripts/rigbuild/epic-build.mjs --api … --project <new> --rig <rig out> --looks-only --apply` | looks, the cue list, loop on, `showEpoch` set; units untouched | step check rows "looks", "cues", "show clock"; read back looks/cues count | — |
| 7 | laser frames | scenes file (`laser` per scene) + rig + hall record | `python3 -I scripts/place/laser_frames.py --scenes … --rig … --hall … --out <rig+frames>` (generated, 3.8 MB: never commit) then `epic-build.mjs … --rig <rig+frames> --laser-frames --apply`; `--laser-lines-only --apply` gives existing lines `beam.laser` | `beam.laser.frames` on every cube line | step check row "laser frames"; `laser-frames-py.test.js` | the room page, Show render, one picture per scene (`scripts/measure/laser-scene-shots.cjs`) |
| 8 | light environment | his pick of an environment | `node scripts/place/apply_light_env.mjs --api … --project <new> --from-project <picked> [--from-api https://dev.diiii.xyz/serverXR] --apply`; the picker sheet `scripts/measure/env-pick-shots.cjs` | `renderSettings.atmosphere`, exposure, bloom, floor surface, fog | step check row "light environment"; mean luma per cue (`look_energy.py`, frame stats) against his example | the environment sheet: he takes one |
| 9 | the standard look | — (code) | render modes **Studio / Tech / Show** (`src/shared/renderPlan.js`, decision `docs/ai/decisions/2026-10-15-studio-tech-show-render.md`); quality **Low / High**; the Studio's lines of light as THE look of the room page (N808/N810, in progress) | nothing in the document (render-time only) | step check rows "standard look" (bloom OK; lines OWED) | the room page in Show beside the Studio, same cue |
| 10 | physics | the built project | `python3 scripts/place/physics_check.py --api … --project <new>` (0 leaks) + `look_shots.cjs` with views from OUTSIDE and from the floor (agent screen, `DI_TEST_LANE=<own>`) | leak count, pictures | 0 leaks; pictures opened and compared | the outside look, before anything else is shown |
| 11 | renders / sheets | the project | `look_shots.cjs` (Studio views) · `cue-frames.mjs --gpu` (one frame per cue, room page) · luma numbers | pictures + a sheet page | every picture opened; numbers beside them | the sheet in his di browser (`di-show <file>`) |
| 12 | the show page | the project | the room page `/<space>/p/<project>` (one 3D page; view bar, Display → Tech, Auto fly, Walk) · publish the project | the public link | `scripts/measure/page-check.cjs` | he opens it; test copy `<space>-test.diiii.localhost/<space>/<slug>` |
| 13 | dev | code on branches, content on the scratch stack | code: task branch → PR → land batch into `dev` → dev deploy (check `/api/health` releaseId) · content: copy the version to dev (`copy-version.mjs --from-api`, `tier-sync --changed`), the owner's word · local follows dev (`di follow`) | dev.diiii.xyz/<space> shows the version | dev and local same commit; `di follows` | `dev.diiii.xyz/<space>` on his screen |
| 14 | the real cubes / DMX | the patch, the frames | desk patch (`patch-plan.mjs`, Light `/light`), MVR `export-mvr.mjs` + `validate-mvr.mjs`, the laser frames sender, the DMX node | light in the hall | a real lamp moves on the cable; cubes draw the frames | the hall on the night |

## 2. Traps already paid for (each cost an evening or more)

- **epic-build's default mode (no `--…-only` flag) deletes and re-creates every unit** from the rig file: hand moves are lost and
  `beam.laser.frames` dropped. Written as a lesson at 06:02 on 10-15 (N767); a default-mode run at 06:3x still moved all 102
  units (found 14:07, N803; restored from the backup). Since 2026-10-21 the tool holds the line itself: on a project that already
  holds rig units the default mode exits 1 before its first write, dry run and `--apply` alike, naming how many units it would
  delete and create, how many carry laser frames, and the narrow modes (`NARROW_MODES`: `--looks-only`, `--laser-frames`,
  `--laser-lines-only`, `--tag-steel-only`, `--patch-only`, `--lasers-only`, `--render-only`, `--desk-only`, `--mark-only`). A first
  build (no rig unit) runs as before. A rebuild on purpose is `--rebuild-all`, and with `--apply` it also needs `--out <dir>`, where
  the document before is written ahead of the first op.
- **`--lasers-only` is a dry run unless `--apply`** (since 2026-10-21; before, it wrote without it).
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
scenes file and a layout file · one project, several scene sets ("stories", N717) ·
the lines of light as THE look (N808/N810). Rows: N811.1 scenes50 · N811.2 palette audit · N811.3 outside rule · N811.4 laser
design · N811.5 scenes sheet · N811.6 laser sheet · N811.7 energy data · N811.8 light-environment table · N811.9 outside/floor
views · N811.10 one generator · N800.1 read-back · N717 stories (N811.11: the scenes file, moved in this job). close a row by moving the thing into
`scripts/place` with a test and fixing this table.

Closed (cloud/epic-build-default-guard-2026-10-21): N767 guard → `epic-build.mjs` `defaultModeRefusal` + `--rebuild-all`; test `scripts/rigbuild/epic-build.test.js`.

Migrated (feat/migrate-scenes-2026-10-15): N811.1 `scenes50.py` → `scripts/place/scenes_build.py` (spec → scenes file + check; the colour audit stays with N811.2) · N811.3 → `scenes_outside_rule.py` · N811.4 → `laser_design.py` + `rigs/moxir-laser-design-2026-10-15.json`; test `scripts/place/scenes-tools.test.js`.

## 6. Script usage for the place steps (appendix, 2026-10-13, PR #902)

Commands quoted from each script's own header; none was re-run when written (UNVERIFIED). The `venue*` Claude Code skills under `.claude/skills/` are thin entry points to this file; this is their only copy of the text. The six place steps below are the older numbering (P1 paint plan … P6 review) and map onto steps 1-3, 6, 10-12 above.

### Rules that hold on every place step

- **The hall comes first.** Steps 1–6 assume a `hall.json` from `scripts/place/hall.py`
  (or a scan through `place.mjs`). That is `scripts/place/README.md`, not this skill set.
- **Back the space up before anything writes to it** (README, step 0):
  `node scripts/space-bundle.mjs export <space> --data-root <data> --out <dir>/<space>.space-bundle.tar.gz`.
- **Scratch before the owner's project.** Render/measure runs against a scratch stack
  (`epic-build.mjs` refuses any host but localhost / 127.0.0.1). Writing into the venue's
  real project (step 5) is the owner's word, every time.
- **Measured, not claimed.** A value nobody taped is ASSUMED/ESTIMATED in the rig file,
  and stays so on every page. A render is not a photometric measure of the hall
  (`frame_luma.py` says so of itself).
- **GPU frames on the real card only**, under `di-test-browser run`, with `timeout`;
  every page-opening script uses `close-on-signal.cjs` (known-fixes: tabs left drawing).
- Python scripts run with `python3 -I` (they say so; the step skills quote every command that way);
  most take `--repo .` and `--check` for numbers-only JSON.

### P1 Step 1 — paint_plan (`scripts/place/paint_plan.py`)

Draws only what is fixed (columns, permanent objects with heights, glazed lanterns),
the stage as built and a 6 m grid; no fixtures, no beams. Oriented as the dance floor
sees it: stage at the top, entry at the bottom, house left on the LEFT.

```bash
python3 -I scripts/place/paint_plan.py --hall <hall.json> --stage <stage-line.json> --out plan.png [--ppm 40]
### P1   --full          the whole building, wall to wall (default: the nave only)
### P1   --lasers <aerial json>   draw the free crane where the show parks it, the cubes and their lines
### P1   --views <rig json>       mark the rig's eye-height views as audience view points
### P1   --quiet-lamps   pendant lamps as small marks
### P1   --title / --key  the line(s) that say what to paint
```

MOXIR inputs: `scripts/place/rigs/moxir-hall-*.hall.json`, `scripts/place/rigs/moxir-stage-line-2026-10-07.json`.

#### Hand-off

- The pixel ↔ hall mapping is written into the PNG's text chunk (`di-plan-map`); step 2 reads it.
- **Keep the exact file the owner opens.** Step 2 diffs his painted copy against it;
  a regenerated plan is only a fallback (`paint_zones.py` notes the drawing changed by
  1038 px once).
- The owner paints closed loops, one colour per meaning, in GIMP, and writes what each
  colour is. Ask for the colour → meaning list with the painted file.

### P2 Step 2 — read_paint (`scripts/place/read_paint.py`)

His strokes = pixels that differ from the clean plan; per colour, a closed loop's
inside is an area; written in hall metres as 1 m cells using the plan's own
`di-plan-map` chunk.

```bash
python3 -I scripts/place/read_paint.py --plan clean.png --painted his.png \
    --colour 'hot=224,64,0=hot zone' --colour 'use=0,224,64=we can use this area' \
    --out zones.json --picture my-reading.png
### P2   [--min-m2 15] [--work-ppm 5] [--close-px 3]
```

- `--colour id=R,G,B=name` — the names are HIS words; words painted on the plan are not read.
- Limits (the script's own): an open loop is not an area (the `--picture` shows it);
  colours closer than ~70 RGB merge; it stops if the painted picture is not the plan's size.
- **Show the owner `--picture`** before anything uses the zones: it is the reading, he confirms it.
- Commit the result as `scripts/place/rigs/<venue>-zones-<date>.json`
  (MOXIR: `moxir-v2-zones-2026-10-09.json`).

Older reader, 2026-10-08: `scripts/place/paint_zones.py --painted … --clean … --out zones.json [--overlay zones.png]`
(threshold diff; `--regenerate` when the clean plan was lost). `read_paint.py` is the one step 3 consumes.

### P3 Step 3 — layout (a rig file in `scripts/place/rigs/`)

The output of this step is always a **rig file** — the format `rig.mjs` and
`epic-build.mjs --rig` read. Pictures and numbers only; nothing is written to a project here.

| need | script (usage from its header) |
|---|---|
| where can a beam head stand and run clear | `python3 -I scripts/place/occlusion_sky.py --repo . --out <dir>/occlusion` · `--check [--quick]` |
| layouts of the fixed kit, placed and aimed by the occlusion numbers | `python3 -I scripts/place/moxir_v2.py --repo . [--out <dir>]` · `--check` |
| spread over the painted hot zone, placed from audience eyes | `python3 -I scripts/place/moxir_v2_spread.py build --repo . [--out <dir>] [--placement <dir>/placement.json]` (placement in `moxir_v2_eyes.py`; search ~25 min on one core, `--placement` reuses it) |
| one rig from two (owned by mount) | `python3 -I scripts/place/moxir_v2_compose.py --repo . <ground rig> <cranes rig>` — also writes the patch, prints the sha256 of the rig built twice |
| re-place symmetric about the DJ axis | `python3 -I -B scripts/place/moxir_v2_symmetry.py --repo . [--src …] [--out …] [--check-only]` |

Earlier passes (beta v0.9, 2026-10-08) kept for history: `design_paint.py`,
`epic_placement.py`, `lasers_v2.py`, `occlusion.py`.

#### Rules

- The zones are input, not decoration: every unit's place is checked against them
  (MOXIR: units outside the hot zone 27 → 0, PROGRESS 2026-10-09).
- Lasers are the laser session's table, used as given; a laser aim is never invented here.
- A new layout is a new dated rig file; the old one stays as the labelled old version.
- Safety geometry is shared (`scripts/rigbuild/safety.mjs`): geometry only — a rigger
  signs the rigging, a laser safety officer signs the lasers.
- Run the step's tests: `npx vitest run scripts/place scripts/rigbuild`.


MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").

### P4 Step 4 — render (measure)

"Too dark" is a measurement, not an impression (`scripts/rigbuild/luma.mjs`).

#### 4a — the rig into a scratch project

```bash
di-dev up <tree> --api scratch
node scripts/rigbuild/epic-build.mjs --api http://127.0.0.1:<port>/serverXR --project <scratch copy> \
    --token-file <dummy env> --rig scripts/place/rigs/<rig>.json [--out <dir>] --apply
```
Refuses any host but localhost / 127.0.0.1. Never dev, prod or the owner's own di.

#### 4b — measure (browser's copy only; nothing written to a server)

| measure | command |
|---|---|
| frames per job (layout × haze × look × view), measurement mode, one EV100 | `timeout 600 di-test-browser run scripts/place/moxir-v2-true-frames.cjs --plan <plan.json> --out <dir> [--only …]` (plan from `moxir_v2_true.py plan` / `moxir_v2_spread.py plan`) |
| lux on the stage (the scene's own probe) | `timeout 600 di-test-browser run scripts/place/moxir-v2-probe.cjs --plan <probe-plan.json> --out <probe.json>` |
| mean luminance + white-out share per frame | `python3 -I scripts/place/frame_luma.py <frames dir> > luma.json` |
| luma + fps cue by cue, as a visitor | `node scripts/rigbuild/look-probe.mjs …` (RIG_BUILD §20) |
| named views + fps + draw calls | `node scripts/place/rig-look.mjs --gpu --base <base> --space <s> --project <p> --hall <hall.json> --rig <rig> --out <dir> --tag <t> [--views …]` |
| the still to judge the show by (Cycles, GPU) | `blender -b -P scripts/place/moxir_render.py -- --hall <hall-show.glb> --doc <document.json> --out <png> [--look peak] [--view floor\|entrance\|dj\|outside] [--samples 128] [--haze 0.015]` |

#### Rules

- Real GPU only: the probe and rig-look refuse a software renderer (headless Chrome
  gets SwiftShader — README "Things that have already gone wrong").
- Always under `timeout`, and the script uses `close-on-signal.cjs`, or a killed run
  leaves a tab drawing the scene.
- State the exposure (EV100, scene scale) next to every number; numbers from
  different exposures are not compared.
- Open the frames and look at them. A number with no frame looked at is not a result.
- Known open item: the scene squares a look's level (intensity = nominal × level²;
  PROGRESS 2026-10-09) — owed to the viewport, not corrected here.


MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").

### P5 Step 5 — integrate

This is the first step that writes outside a scratch stack. **The owner's word
first**, and the space backed up first:

```bash
node scripts/space-bundle.mjs export <space> --data-root <data> --out <backup dir>/<space>.space-bundle.tar.gz
```

| what | command |
|---|---|
| hang the rig in the hall's project, as ops | `node scripts/place/rig.mjs --rig scripts/place/rigs/<rig>.json --hall <work>/hall.json --project <hall project> [--api …] [--real budget\|all\|none]` |
| take it down again | `node scripts/place/rig.mjs --project <hall project> --remove` |
| the show copy of the hall (no planning floor tape) | `node scripts/place/hall-show.mjs --in hall.glb --out hall-show.glb --api <base>/serverXR --project <show project> --token-file ~/.di/di.env` |
| a corrected hall into projects already built | `scripts/rigbuild/swap-hall.mjs`, then `realism.mjs` and `work-light.mjs` (README "Putting a corrected hall into the rooms") |
| two rigs into one before hanging | `scripts/place/moxir_v2_compose.py` (see `venue-layout`) |
| the crew's patch table (md/html/csv) | `node scripts/rigbuild/patch-table.mjs …` from the rig's patch file (`rigs/*-patch-*.json`) |

#### Rules

- `rig.mjs` only touches entities whose id starts `rig-` (plus the night and the
  shadow switch); a re-run deletes those first. Undo the whole hall: import the backup
  bundle (`space-bundle.mjs import … --force`).
- Its default `--api` is `https://local.thedi.studio/serverXR` — the owner's own di.
  Say which tier you write to, every time.
- Patch checks are tests: `npx vitest run src/rigbuild scripts/rigbuild`
  (MOXIR: `src/rigbuild/moxirV2Patch.test.js`).
- After writing, step 4's `rig-look.mjs` against the real project, frames looked at.


### P6 Step 6 — review

The owner decides; this step makes the decision readable. Every number on the
page comes from steps 3–4's JSON — the page itself is layout only.

| page | command |
|---|---|
| layouts side by side + contact sheet | `python3 -I scripts/place/moxir_v2_page.py --dir <dir>` (reads `v2-layouts.json`, `occlusion/occlusion-sky.json`, `frames/<layout>-<look>-<view>.png`) |
| the spread / true-look pages | `python3 -I scripts/place/moxir_v2_spread.py page --repo . --out <dir>` · `moxir_v2_true.py page --repo . --out <dir>` |
| look-probe runs side by side (before / after) | `node scripts/rigbuild/look-compare.mjs --out <dir>/compare.html --run "before=…/probe.json" --run "after=…/probe.json" [--refs …]` |
| render beside and over the photograph | `python3 -I scripts/place/compose.py --photo <photo.jpg> --render <shot.png> --out <composite.png> [--side-only]` |
| one-page site sheet (plan from rig + hall json) | `python3 -I -B scripts/place/moxir_site_sheet.py [--pdf PATH]` |

#### What the review hands back

- The advice, with the numbers that carry it (e.g. "layout B, 10 PARs on the cut", PROGRESS 2026-10-09).
- **Owed**: every value still ASSUMED, every sign-off not given (rigger, laser safety
  officer, the venue's OK), every open owner's call — listed, not buried.
- The owner's answer goes back in as input: a repaint → step 1/2, a re-place → step 3.
- Record it in the branch's session note (`docs/ai/sessions/<branch>.md`), not CURRENT.md.

MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").

