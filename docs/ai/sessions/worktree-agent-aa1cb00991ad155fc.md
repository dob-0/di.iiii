## 2026-08-22 — published pages stop cropping on a portrait phone

- `computeFramingCamera` fitted the entry camera to the **vertical** fov only and never
  read the aspect, while `frameSphereInControls` — 25 lines below it in the same file —
  already did it correctly. Two copies of one calculation that had drifted; that drift
  is the actual defect, not the missing line. Both now go through one shared
  `getLimitingHalfFov` / `computeFitDistance` helper so they cannot separate again.
- The trap that makes a naive fix invisible: `PublicProjectSceneSurface` passes
  `AUTO_FRAME_MAX_DISTANCE = 25` as `maxDistance` and it is clamped with `Math.min`, so
  on any scene wider than about 4 units the corrected larger distance is yanked straight
  back down. The clamp is now scaled by `getAspectFitScale(fov, aspect)` — it caps how
  much of a sprawl the shot swallows, not a raw metric distance. The factor is exactly 1
  for any aspect >= 1, so landscape/desktop framing is unchanged.
- Guard: `src/utils/cameraFraming.test.js`. Portrait must be >1.9x landscape for the same
  sphere **and** the clamped case must stay >1.9x. Both clamp tests were watched go red
  with the scaling removed, then green with it back.
- Looked at it, did not just test it: headless Chromium at 390x844, deviceScaleFactor 3,
  on a real published scene page served from this worktree. Before, the entry shot sat at
  half the needed distance — the grey plane bled off three edges, the title was jammed
  under the Walk/Fly button, the aircraft model was out of frame entirely. After, the same
  scene from ~2x back: aircraft, box and plane all inside the frame with margin. Landscape
  before/after at 1440x900 are identical, as intended.
- Two things found in the same area and deliberately NOT changed:
  - The auto-frame bounding sphere is still built from entity **positions only**, ignoring
    size/scale, so a large object near the edge can still overflow. A correct fix needs real
    geometry bounds, which do not exist before mount; the cheap proxy (expand by scale) would
    let one big ground plane or skybox blow the sphere up and push every scene far away. Left
    open on purpose rather than shipped blind three days before a camp.
  - `entryView: 'fixed-camera'` removing Walk/Fly is deliberate, not a bug — recorded in
    `known-fixes.md` ("fixed-camera/code presentation modes are a deliberate per-project
    choice and stay untouched").
