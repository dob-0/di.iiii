# 2026-10-23 — The AR scan: live guidance on Android (ledger N1250, N1250.1)

## The ask

The owner, 2026-10-23: *"we need animations and better ui i mean we like where scanned where to stay and etc we need to use
full power of scans tech"* and *"start with the android android gives more acces right so we need to fully go with that"*.

## What was decided

`/{space}/scan` keeps the camera walk (any phone, MediaRecorder, compass ring) as the fallback, and gains an **AR scan**
on browsers that answer `navigator.xr.isSessionSupported('immersive-ar')` — Chrome on Android over ARCore. Code:
`src/scan/ar/`. Everything that decides is pure (`scanBrain.js` and the modules it calls) and is tested by replaying walks;
the screen (`ArScan.jsx`) only draws and uploads.

| Item | How | Where |
| --- | --- | --- |
| Coverage paint | 0.25 m cells; a cell is KNOWN when a depth sample (or hit-test point) lands in it, SEEN by a kept shot that had a sample in it within 6 m; good = ≥ 3 kept views ≥ 15° apart, thin = fewer, missed = none. Drawn as square points over the camera. | `coverage.js` |
| Floor map | top-down canvas: each floor column's worst cell, the path, a dot per kept shot, the person, the next spot; −z up like the plans. | `floorMap.js` |
| Next spot | gaps (missed 2, thin 1) gathered in 1 m columns, scored weight / (1 + distance/4 m); spot 2 m back towards the room, inside the floor found; aim from 1.5 m eye height; a breathing square ring on the floor, an arrow on screen. | `nextSpot.js` |
| Live warnings | predicted blur = t_exp · f_px · (ω + v_lateral / d) from the AR poses; too close < 0.5 m; too dark luma < 0.18. A frame is kept only when none is raised; shown warnings are held 700 ms so the screen stays calm. | `warnings.js`, `scanBrain.js` |
| Real size | the session's `local-floor` space is in metres; the sidecar says `scale.source: webxr-tracking`; `scripts/place/poses.mjs --recon … --scale-out` fits the reconstruction to the walk; `fit.mjs`/`place.mjs --scale-from` use it (below a tape, above `--door-guess`). | `poseSidecar.js`, `scripts/place/poses-lib.mjs` |
| Frames carry their pose | one `<walk>.poses.json` per walk: pose (camera→world), pinhole intrinsics in pixels of the saved image, sharpness, predicted blur, anchor pose. Plus `<walk>.session.json` (ticks at 2 Hz) so a phone walk can be replayed at the desk. Both are assets in `<space>-sources`, not on the wall. | `poseSidecar.js`, `recordedSession.js`, `scanSources.js keepWalkFile` |

## Sources

- W3C WebXR Device API (immersive-web.github.io/webxr) — sessions, `local-floor`, `XRView.projectionMatrix`.
- WebXR AR Module; Hit Test Module; Anchors Module; DOM Overlays Module; Depth Sensing Module
  (`depthSensing.usagePreference`, `XRCPUDepthInformation.getDepthInMeters(u, v)`) — immersive-web.github.io.
- WebXR Raw Camera Access (immersive-web/raw-camera-access; Chrome 107+): `XRView.camera`, `XRWebGLBinding.getCameraImage`.
- ARCore Depth API developer guide: best depth 0.5–5 m (the 0.5 m "too close" setting).
- Agisoft Metashape User Manual, "Capturing scenarios": each point in ≥ 3 images, ~80 % forward overlap (the 3-view rule,
  the 12° / 0.3 m novelty gate).
- COLMAP documentation, "Output format" and FAQ "Reconstruct sparse/dense model from known camera poses" (the COLMAP export).
- Horn, B.K.P. 1987, "Closed-form solution of absolute orientation using unit quaternions", JOSA A 4(4) §2.D — symmetric
  scale (the scale fit needs no rotation).
- Motion blur ≈ exposure × focal px × angular speed: the standard pinhole approximation.
- RealityScan (Epic Games) mobile — the green/yellow/red coverage idiom the owner named.

## Measured

- **Gate vs today's camera, on the synthetic walk** (120 s lap of an 8 × 6 × 3.2 m room with a planted 90 °/s turn, a
  0.35 m approach and a dark stretch; `src/scan/ar/ar.test.js`): one frame every 400 ms with no gate keeps **104 faulty of
  301** (35 %); the AR gate keeps **0 faulty of 45**. The camera walk's real number on 2026-10 was 75 blurry of 159 (47 %).
  This proves the gate obeys its model; whether the model's 1/60 s exposure matches the S24 is not measured.
- **Brain cost**: 0.23 ms per tick on aylmo (Node, 1201 ticks); the phone runs it at 10 Hz.
- **Meshroom rotation order** (AliceVision 2025.1 `aliceVision_exportColmap` reading our SfMData back): rotation written
  row-major came back as its inverse; written column-major (Eigen order) it matches our COLMAP export to 1e-6. So the
  Meshroom route is checked for pose order; exportColmap stopped (`map::at`) after the first view of a featureless test
  file, so the route is not proven end to end.
- **camera-access resolution: UNMEASURED.** No WebXR on aylmo. The AR screen prints `camera W×H` and every sidecar stores
  `cameraImage`; the first S24 walk is the measurement.

## The known tension — camera-access vs 4K

`getUserMedia` and an AR session do not hold the camera at once (the page lets go of the stream before it asks for the
session). Raw camera access gives the ARCore camera image, documented as about screen-resolution, not the 4K the camera walk
asks for. Decided: the AR scan keeps posed frames from camera-access, and the camera walk stays for 4K footage. Options,
not built and not measured: (a) pause the AR session, take one `ImageCapture.takePhoto()` still at full resolution, resume —
the pose of that still is then interpolated, not tracked; (b) walk twice, AR first for guidance + poses, camera second.

## Not done here

- Not run on a phone. The camera texture's orientation (one vertical flip is applied), depth arriving as `cpu-optimized`,
  and hit-test fallback are unproven until the S24 runs them.
- No COLMAP on aylmo; the COLMAP export is checked by the format and its own round-trip test only.
