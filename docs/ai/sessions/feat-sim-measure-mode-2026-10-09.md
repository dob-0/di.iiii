## 2026-10-09 — Measurement mode: fixed exposure, lux and beam probes, analytical check

- Step 2 of the simulation method (agent report `simulation-method.md` §3.4): `?measure` (or Alt+Shift+M) fixes the
  scene's exposure at a stated EV100 and turns off auto exposure, bloom, the glare veil and the work light; probes read
  linear values from a half-float target before tone mapping. Contract: `docs/architecture/MEASUREMENT_MODE.md`.
- New code in `src/project/viewport/measure/`; small hooks in HdrBloom, atmosphereStore (`holdGlareVeil`),
  RenderSettingsEffect (mounts it), RigBodies (names the bounce light). No physics file changed.
- T1 on the real GPU (aylmo RTX 3080, ANGLE/Vulkan, under the browser lock), twice with identical numbers: 15 of 15
  checks pass — inverse square and cosine law within 0.04 % (305.000 → 304.955 lx on axis), the fitted cone's 50 % point
  within 0.012 %, the beam probe's FWHM within 0.45 %, the mode's switches seen in the pipeline; the control (mode off,
  work light on) reads +4.36 % and fails as it must. Runner `scripts/measure/t1-gpu.cjs`, page
  `src/project/viewport/measure/harness/t1.html`.
- Found on the way: a `distance: 0` lamp draws its beam in air only 20 m long (`UNLIMITED_THROW`, spotBeam.js) —
  reported to the physics branch. The harness needs `rendererWithFallback` (no 'high-performance' context on this laptop).
- Seen read-only on MOXIR v1.0 (installed di, desktop 1600×900 and phone 390×844): the label, the dark hall with the
  work light (0.3) and the rig bounce held off, 6 real SpotLights listed. Not yet seen by the owner.
- Owed: the rig build should write `renderSettings.photometry.sceneScale` into rig documents (MOXIR needs `&scale=0.02`
  until then); probe-point lists per cue (T2); the Cycles reference (step 4) before T2/T3 can pass or fail.
