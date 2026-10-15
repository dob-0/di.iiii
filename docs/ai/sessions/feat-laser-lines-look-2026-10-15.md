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
