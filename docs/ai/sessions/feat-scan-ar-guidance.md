## 2026-10-23 — the AR scan on Android: coverage paint, floor map, next spot, live warnings, real size, posed frames

- `/{space}/scan` keeps the camera walk as the fallback and gains "Scan in AR" where `immersive-ar` is supported
  (Chrome on Android, ARCore). Code in `src/scan/ar/`; the deciding part (`scanBrain.js` and what it calls) is pure and
  tested by replaying walks; `?ar=play` replays a synthetic walk (or `&session=<url>` a phone's) on any screen.
- Every kept frame is gated by predicted blur (from the AR poses), too close and too dark. On the synthetic walk the
  un-gated 400 ms camera keeps 104 faulty of 301; the gate keeps 0 faulty of 45.
- One pose sidecar per walk (`<walk>.poses.json`, pose + intrinsics + metres) and a 2 Hz session file land in
  `<space>-sources` as assets. `scripts/place/poses.mjs` writes a COLMAP known-pose model, locks the poses into Meshroom's
  SfMData (rotation order checked with `aliceVision_exportColmap`: column-major) and scales the reconstruction;
  `fit.mjs` / `place.mjs --scale-from`.
- NOT done: no run on a phone yet — WebXR, depth, the camera picture's orientation and the camera-access resolution
  (UNMEASURED; the screen and the sidecar print it) wait for the owner's S24. Decision record:
  `docs/ai/decisions/2026-10-23-scan-ar-guidance.md`.
