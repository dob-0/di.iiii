# Session — lasers drawn as lasers (diagnosis + pure functions, HAND-OVER), 2026-10-15

Owner 05:4x, scene "Green breath", moxir-v2-11: *"the lasers don't even look like lasers :D"* — the 36 LaserCube lines
(rig-laser-1a … 6f, six cubes on the back crane girder at y 8.82 m, z −42.3 m, 1.37 m apart, six lines each over 0.090 rad
= 18 mrad apart, all aimed +z along the hall) read as a soft green fog under the roof, not as thin bright lines.
Brief: `~/work/agent-reports-2026-10-15/moxir-50/briefs/lasers-as-lasers.md`. Branch `feat/laser-lines-look-2026-10-15`.

## Status: diagnosis and the pure functions landed; the shader change is OWED (not seen on the GPU)

The GPU renders could not run: the machine sat at 91–95 °C package from other jobs' browsers for the whole job (the
`di-test-browser` heat guard holds every run above 85 °C, the owner's rule, never raised). The 7-shot plan is ready
(below) and was queued for 25 min without a single shot. A shader change that was never looked at would break "seen on
the real surface", so the renderer is unchanged here.

## Diagnosis (numbers from the shader's own formulas, `scripts/measure/laser-look-diagnose.mjs`)

Owner's camera (the document's fixedCamera: [-3.75, 1.7, 18.1] → [-3.75, 5, -20], fov 70°, 900 px: 1.556 mrad a pixel),
σs = 0.02 /m (atmosphere.scattering), g = 0.7, exposure 3.5, cube drive pure green (0,1,0):

| s from the cube (m) | eye distance (m) | HDR level per line (1 = white) | drawn width (px) | gap to the next line of the same cube (px) |
|---|---|---|---|---|
| 2  | 59 | 6.9 | 1.5 | 0.39 |
| 5  | 56 | 6.7 | 1.5 | 1.03 |
| 10 | 51 | 6.4 | 1.5 | 2.26 |
| 20 | 41 | 5.6 | 1.5 | 5.58 |
| 40 | 22 | 2.6 | 1.5 | 20.6 |
| 60 | 9  | 0.04 | 4.6 | 70 |

The 40 W lines (rig-laser-41/42) draw at 107–314 × white over the same s.

Cause, in the code (`src/objectComponents/laserLineMaterial.js`):
1. **The far 20 m of the comb is drawn as one saturated band per cube.** Each line is a ribbon at least `MIN_PIXELS` = 1.5 px
   wide with a soft parabolic cross profile `1.5·(1 − u²)` and no core; the six lines of a cube are 0.4–2.3 px apart there,
   so the ribbons overlap and ADD (additive blending) — six lines at 6–7 × white each sum to ~40 × white, which ACES clips
   flat: no dark gap is left between them. A screen pixel here is 1.556 mrad; the eye resolves ~0.3 mrad, so in the real
   hall these lines are separate.
2. **The bloom spreads that clipped band into a glow.** `renderSettings.bloom` is on (strength 0.03, three's five scales
   ≈ 3 × strength of the blurred light added back — `src/project/viewport/bloom.js`): 9 % of a ~40 × white band over tens
   of pixels is still several × white → the "fog under the roof". (Hypothesis, to be confirmed by the `gb-own-nobloom`
   shot below.)
3. **The near part is too faint to read as a line.** Overhead the scattering angle goes toward 90°–180° where the HG phase
   is small (0.04 × white at s = 60), so the lines fade out as they come toward the viewer — this part is physics
   (single scattering, g 0.7), not a bug.
Not the cause: the 36 entities are 36 static single-point frames (not a scanned `frames` fan drawn as an area); the
cube's three.js spotLight has angle 0.002 rad (lights a cm-size spot) — to be confirmed by `gb-own-nolight`.

## What landed

- `src/objectComponents/laserLine.js` §7: `coreWidth` (beam width, ≥ `MIN_CORE_PX` = 1 px), `haloShare`
  (Beer–Lambert 1 − exp(−σs·s)), `haloRadius` (Fermi–Eyges small-angle multiple scattering, √((2/3)·σs·2(1−g)·s³)),
  `haloRadiusCapped` (≤ half the gap to the next line of the fan), `coreHalo` (core luminance over its width + halo peak,
  energy kept). 5 new tests in `laserLine.test.js` (18/18 pass).
- `scripts/measure/laser-look-diagnose.mjs` (the table above, any document and camera, no GPU).
- `scripts/measure/laser-lines-measure.py` (projects every laser line into a screenshot: peak luma, background, FWHM in px
  and m at s = 5/10/20/40 m, and the count of separable peaks across the fan at s = 20 m).

## Owed (hand-over, in order)

1. **Shader** (`laserLineMaterial.js`): draw each line as core + halo from `coreHalo` — core 1 px minimum with a hard
   (box/≤1 px Gaussian) profile carrying (1 − haloShare); halo a Gaussian of `haloRadiusCapped` carrying haloShare at the
   uncapped peak; the fan spacing per line comes from `scanLines` (angle to its nearest neighbour) as a vertex attribute.
2. **Saturation**: decide with the owner how a line far above white is shown (today it clips flat and blooms). The
   physically honest options: keep the HDR value but exclude laser fragments from bloom (a lens veil is a few %, CIE 146,
   but it must not merge lines a real eye separates), or tone-map the laser core separately. Ask before choosing — it is a
   look decision (the owner's rule: talk first when two readings lead to different builds).
3. **End spot**: the dot on the first surface (`beamReach.js` already gives the hit) — 4–6 cm, its own luminance.
4. **Renders**: run the plan (`/tmp` copy not kept; rebuild with the brief's floor cameras): green-breath and second-drop
   from the owner's camera, a side camera at 10.7 m from the comb ([-8, 1.7, -32.338] → [0, 8.8, -32.338], fov 40), and
   along-the-comb; plus no-bloom, no-spotLight (beam.only) and lamp-only (lasers removed) variants of green-breath, all with
   `scripts/measure/light-env-shots.cjs` on lane 2, then `laser-lines-measure.py`. Lamp-only before/after diff < 0.5 %.
5. Then: RIG_BUILD laser paragraph's "owed" line closed, a known-fixes row with the guard, the wiki if it describes the look,
   and the before/after page `~/Downloads/moxir/v2-11/lasers-look.html`.

## Review (learn once)

Meant: diagnose on the GPU, fix the shader, show before/after. Happened: diagnosis by arithmetic only; GPU blocked by heat
for the whole job. Lesson (owed as a row): a job whose done needs GPU renders must check the package temperature and the
lane queue BEFORE it starts, and the brief should say what to do when the heat guard holds (here: arithmetic diagnosis +
pure functions + hand-over). Also: never pipe a long `di-test-browser run` through `tail` — the progress is hidden until it
ends (cost one blind 20-min wait).

---

# Job 2 — the shader (branch `feat/laser-lines-shader-2026-10-15`, from the show branch at 8ce24ad9), 2026-10-15 05:0x

Brief: `~/work/agent-reports-2026-10-15/moxir-50/briefs/lasers-look-2.md`. Look decided by the lead from the owner's words
(N730): reading 1 — a white core with the colour in the halo; lasers do not feed the bloom.

## Why the Studio looked right and the room did not (evidence, by code — no browser: 93–98 °C all job)

The brief's hypothesis was a flag (`atmosphere`, governor, bloom) differing between the pages. Both pages mount
`RenderSettingsEffect` with the document's renderSettings (`StudioViewport.jsx:792`, `LiveProjectScene.jsx:1983`), so both
draw `LaserLines` (the ribbons). The difference: the Studio ALSO mounts `<LaserView>` (`StudioViewport.jsx:795`,
`src/rigbuild/LaserView.jsx`) — the laser server's frames as 1-px `lineSegments`, additive, opacity 0.3, NOT tone-mapped,
drawn on top. That overlay is the "crisp green-white lines" of Screenshot_20261015_042548/043344. The room page has no
overlay (grep: `LaserView` is imported only by StudioViewport), so it shows the ribbons alone, bloomed: the slab of
043205 ("the net"). Not checked live: which flag values each page had (no browser slot); the overlay difference does not
depend on them.

## What landed

- `laserLineMaterial.js`: core + halo shader (the formulas of `coreHalo`, tested in JS); `aSpacing` per line; end spot
  material + geometry (`laserSpotGeometry`, `createLaserSpotMaterial`).
- `laserLine.js`: `coreHalo` now carries the whole haloShare in the CAPPED Gaussian (the brief: "Gaussian of
  haloRadiusCapped, carries haloShare" — changed from the first job's "peak stays uncapped", which made the halo invisible);
  `lineSpacings`, `LONE_LINE_SPACING_RAD` (0.5° scan step, ASSUMPTION), `laserSpot` + `SPOT_ALBEDO` 0.3 (ASSUMPTION).
- `src/project/viewport/laserOverBloom.js` + HdrBloom: lasers held out of the room's render pass and drawn after the glow,
  into the same HDR buffer and depth, before exposure and tone mapping. No composer (XR, no bloom): unchanged path.
- `scripts/measure/laser-glsl-check.mjs` (glslang ES 3.00: 4/4 compile), `laser-look-diagnose.mjs` gained the after model.
- Tests: laserLine 23/23, laserOverBloom 2/2; `vitest run src/objectComponents src/project/viewport` 60 files / 547 pass; eslint clean.

## After, by arithmetic (owner's camera, v2-11, green drive, σs 0.02, g 0.7, exposure 3.5, 1.556 mrad/px)

| s (m) | before: line HDR, width | after: core HDR, width | after: halo HDR, σ px | gap px | dip before / after (HDR, pre-bloom) |
|---|---|---|---|---|---|
| 2 | 6.85, 1.5 px | 6.58, 1 px | 1.12, 0.5 | 0.39 | 0.76 / 0.73 |
| 5 | 6.69, 1.5 px | 6.05, 1 px | 1.01, 0.5 | 1.03 | 1.06 / 0.97 |
| 10 | 6.38, 1.5 px | 5.22, 1 px | 0.84, 0.55 | 2.26 | 0 / 0.03 |
| 20 | 5.55, 1.5 px | 3.72, 1 px | 0.54, 1.36 | 5.58 | 0 / 0.03 |
| 40 | 2.57, 1.5 px | 1.00, 1.17 px | 0.11, 5.1 | 20.6 | 0 / 0.03 |

Read: before the bloom the lines were already apart beyond ~10 m; the bloom (and ACES clipping of the summed band) made the
slab, and it is now out of the lasers' path. Below ~5 m from the cube the lines are under a pixel apart: one line there, as a
1.5 mrad pixel must show. The "net" scenes (scanned sub-lines 0.5° apart) were not computed here.

## OWED — the GPU look (the lead renders; the job held: package 93 → 98 °C, 4–5 `claude -p`)

```bash
sensors | grep Package; curl -s 127.0.0.1:9224/json; ps -eo args | grep -c '^claude -p'   # < 85 °C, lane 2 free, ≤ 3
di-dev down lasers-look 2>/dev/null; rm -rf ~/.cache/di-dev/lasers-look/data && mkdir -p ~/.cache/di-dev/lasers-look
time cp -a ~/.cache/di-dev/moxir-one/data ~/.cache/di-dev/lasers-look/data                # say the copy time
di-dev up lasers-look --api scratch && di-dev name moxir-test2 lasers-look 2>/dev/null     # or the tree address
V=$(mktemp -d); D=~/.cache/di-dev/lasers-look/data/spaces/moxir/projects/moxir-v2-11/document.json
jq '(.document // .) |= (.renderSettings.bloom.enabled=false)' $D > $V/nobloom.json
jq '(.document // .) |= (.entities |= map(if .components.beam.laser then .components.beam.only=true else . end))' $D > $V/nolight.json   # check the beam.only key in SpotLightObject first
jq '(.document // .) |= (.entities |= map(select(.components.beam.laser | not)))' $D > $V/lamponly.json
sed "s#VARIANTS#$V#" scripts/measure/plans/laser-look-shots.json > $V/plan.json
export DI_TEST_LANES=3 DI_TEST_LANE=2
timeout 2400 di-test-browser run scripts/measure/light-env-shots.cjs --base http://lasers-look.diiii.localhost --space moxir --plan $V/plan.json --out $V/shots   # never through tail
python3 -I scripts/measure/laser-lines-measure.py --doc $D --shots $V/shots/shots.json --dir $V/shots --out $V/m.json
# lamp-only: run the same lamponly shot on the show branch (before) and here (after): diff < 0.5 % of pixels
di-test-browser down; di-dev down lasers-look --wipe
```
Also owed: the room's "the net" scene shot from the owner's 043205 camera; then the sheet's "after" column gets pictures.

## Review (job 2)

Meant: shader + bloom split + end spot + seen on the GPU. Happened: all code, tests and docs; GPU still blocked by heat
(98 °C at the check). Lesson kept from job 1 and applied: heat checked FIRST (05:0x, 93 °C), so no time was spent queueing.
New lesson: the "Studio looks right" clue came from a Studio-only overlay (`LaserView`), not from a render flag — compare
what each page MOUNTS before comparing flags.

---

# Job 3 — the owner's decision, tested; the GPU look (branch `feat/laser-white-core-2026-10-15`, from the show branch at 34db1267), 2026-10-15 16:0x

Brief: `~/work/agent-reports-2026-10-15/moxir-50/briefs/lasers-continue.md`. Owner 15:5x: *"white core with colour halo — go fix the
lasers and let me see what we have."* Found: the brief's "draft PR #956" was already MERGED, and the shader it asked for had landed
as PR #958 (core + halo, out of the bloom, end spot), with the zig-zag fix #968 and the room-through-Studio pipeline #972 on top.
The old worktree `~/work/di.iiii-lasers-look` was gone; re-made on a new branch (the merged one is closed). Both pages now draw
the lasers through the one path (`StudioViewport` → `SpotLightObject` `LaserLines` → `laserLineMaterial.js`, held out of the
glow by `laserOverBloom.js`); nothing to unify. `LaserView` (the laser server's live frames as 1-px lines) is now on both pages.

## What landed

- `laserLine.js` 9.: `toneMapAces` (three r185 ACESFilmic, the room's curve) and `whiteness`, so "white core, colour halo" is a
  test, not a claim. `laserLine.test.js` 9.: cube line (cosθ 0.98, along the fan from the floor) and 40 W line (cosθ 0) at 5,
  10, 20 m: core = max(beam, 1 px), never wider; halo ≤ half the 0.5° fan gap; core above the halo; a core ≥ 5× white reads
  white (whiteness > 0.85); the halo keeps the green. 35/35; `src/objectComponents src/project/viewport` 64 files / 588 pass.
- Arithmetic (fov 60, 720 rows, exposure 1.5, σs 0.02, g 0.74), green drive:

| line | s m | core width | core HDR | core whiteness | halo σ px | halo HDR | halo sRGB (r,g,b) |
|---|---|---|---|---|---|---|---|
| cube | 5 | 1 px = 8.0 mm | 80.7 | 1.00 | 2.72 | 1.25 | 0.39, 0.82, 0.56 |
| cube | 10 | 1 px = 16.0 mm | 29.9 | 0.99 | 2.72 | 0.97 | 0.28, 0.77, 0.47 |
| cube | 20 | 1 px = 32.1 mm | 8.2 | 0.92 | 2.72 | 0.59 | 0.10, 0.62, 0.30 |
| 40 W | 5 | 1 px = 8.0 mm | 11.4 | 0.94 | 2.72 | 0.18 | 0.00, 0.20, 0.05 |
| 40 W | 10 | 1 px = 16.0 mm | 4.2 | 0.83 | 2.72 | 0.14 | 0.00, 0.14, 0.03 |
| 40 W | 20 | 1 px = 32.1 mm | 1.2 | 0.44 | 2.72 | 0.08 | 0.00, 0.07, 0.02 |

  Read: the ACES shoulder whitens a green core gradually (1× 0.44, 4× 0.83, 8× 0.92, 30× 0.99); "far above white" in the test
  = 5×. The 40 W heads cross the view (side scatter), so they are dimmer per metre than the cube lines seen along their fan.
- Tools: `laser-scene-shots.cjs --camera` (fixedCamera in the browser's copy + the room camera set through HdrBloom's DEV
  handle `window.__diRoom.camera`, read back into shots.json); `laser-lines-measure.py` reads a shot's own `file`;
  `before-after-sheet.py`; `picture-diff.py` (the lamp gate: changed pixels over 2 levels < 0.5 %).
