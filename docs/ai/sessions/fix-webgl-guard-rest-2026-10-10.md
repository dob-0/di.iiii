## 2026-10-10 — the last two 3D canvases say so when the browser has no WebGL

- Audit A2: `AlgoVrithmExperience.jsx` and `wccSite/landing/ProcessField.jsx` still mounted R3F's raw `Canvas`; #807 had guarded the other five. Both now import the existing `GuardedCanvas` (same one, no new guard).
- New test `src/components/webglGuardRest.test.jsx` renders both with `getContext` returning null and expects the notice. Failed on the old code, 2 pass now; `src/algoVrithm` and `GuardedCanvas.test.jsx` still pass (349 tests).
- Owed: #741 (open, conflicting) is now fully covered for canvases; closing it is the owner's.
