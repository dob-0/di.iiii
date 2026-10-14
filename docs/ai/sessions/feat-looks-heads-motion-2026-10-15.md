## 2026-10-15 — Looks move the moving heads (`feat/looks-heads-motion-2026-10-15`)

**What.** A look can now carry a `heads` block that swings the moving heads in pan and tilt, on the desk and in the 3D room alike.
Before, a look set colour, level and a fixed aim only; heads could not move in a look.

**Schema** (`components.rigLooks.looks[].heads`, normalised by `normalizeRigLooks` in `src/shared/projectSchema.js` and
`shared/projectSchema.cjs`): `{ pattern, period_s, pan_deg, tilt_deg, spatial, kinds }`.
Patterns: sweep, nod, circle, figure8, fan (static spread), wave, cross. Spatial: all, alternate, left-right, ripple.
Defaults period 8 s, pan 30, tilt 20; bounds period 0.5–600 s, pan ≤ 270, tilt ≤ 135. Phases add (wave + ripple = two waves).

**Where it lives.**
- `serverXR/src/lighting/headMotion.js` — the pure function (`headOffsets`, `sanitizeHeads`, `headsPose`); wired in `engine.js`
  (render: pan/tilt/fine channels) and `looks.js` (`sanitizeLook` keeps `heads`).
- `src/rigbuild/headMotion.js` — client port plus the room side; wired in `useRigLook.js` (skips heads the desk moves over DMX)
  and `deskLookValues.js` (the desk look carries heads and units).
- `src/rigbuild/headMotion.test.js` — desk/room parity, per pattern, clamp, zero offset.
- Docs: `docs/architecture/RIG_BUILD.md` §11.4.

**Measured.**
- Tests: 121 pass (headMotion, lookMotion, dmxPose, schemaSync, serverXR lighting). Parity client = server: 2912 comparisons,
  max diff 0 deg (limit 0.01). Room = DMX beam < 0.05 deg, hung and standing. Desk sweep 40 deg ± 0.02.
- Real GPU (RTX 3080, test-browser lane 2, scratch stack `heads`, copy of the MOXIR rig, 1600×900), mean grey-level difference
  of shot 0 against shots 1–4, 2 s apart (quarter of an 8 s period):
  `nod` tilt 30, spatial all: full frame 0.925 / 0.956 / 0.959 / 0.647; beam crop 1.39 / 1.48 / 1.34 / 0.88.
  `circle` pan 30 tilt 30: full 0.962 / 0.686 / 0.778 / 0.141 (shot 4 is one period after shot 0, so it returns); crop 1.29 / 1.04 / 1.13 / 0.22.
  Control, same look without `heads`: full 0.010 / 0.008 / 0.003 / 0.017 (noise). Motion is ~100 times the noise; the crops show the outer beams leaning.
  Shots and the scripts: `~/work/agent-reports-2026-10-15/moxir-50/heads-shots/`.
- Earlier run with `sweep` showed no motion (0.005–0.009): the 18 beams rest straight up, where pan turns nothing.

**Limits.**
- No speed ceiling: `headPeakSpeed()` exists as a check only; a short period with big angles can ask more than a real head can do.
- The speed channel is not written (assumed 0 = fastest). No datasheet ceiling known for the UP-B380F.
- Pan from a vertical rest shows nothing; only tilt patterns (nod, wave, circle, figure8) show. A rest-aim change is a different feature.
- Composed in the fixture's pan/tilt frame, not on the stored euler matrix (tilt about the matrix's local x is not the yoke axis when pan ≠ 0).
- One real-GPU check, one rig; no check on a physical head (UNVERIFIED on hardware).
