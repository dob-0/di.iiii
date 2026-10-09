## 2026-10-09 — Measurement mode: fixed exposure, lux and beam probes, analytical check

- Step 2 of the simulation method (agent report `simulation-method.md` §3.4): `?measure` (or Alt+Shift+M) fixes the
  scene's exposure at a stated EV100 and turns off auto exposure, bloom, the glare veil and the work light; probes read
  linear values from a half-float target before tone mapping. Contract: `docs/architecture/MEASUREMENT_MODE.md`.
- New code in `src/project/viewport/measure/`; small hooks in HdrBloom, atmosphereStore (`holdGlareVeil`),
  RenderSettingsEffect (mounts it), RigBodies (names the bounce light). No physics file changed.
- T1 on the real GPU: `scripts/measure/t1-gpu.cjs` against `src/project/viewport/measure/harness/t1.html`.
- Owed: the rig build should write `renderSettings.photometry.sceneScale` into rig documents (MOXIR needs `&scale=0.02`
  until then); probe-point lists per cue (T2); the Cycles reference (step 4) before T2/T3 can pass or fail.
