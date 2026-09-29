## 2026-09-29 — a composed entry no longer dollies a phone visitor under the floor (MOXIR black on portrait)

- Symptom: https://dev.diiii.xyz/moxir at 390x844 (DPR 2 and 3, real GPU) drew the UI
  chrome over a black room for the whole visit (mean luma 3.2, max 88); 844x390,
  768x1024 and 1440x900 were fine. Same on the local install (0.4.16-rigbuilder.9).
- Root cause: `fitCameraToAspect` (the portrait fix from #286) dollies an authored
  camera straight back along its view axis by `getAspectFitScale` — x1.974 at 390x844,
  fov 55. MOXIR's entry stands at eye height (y 1.6) looking UP at the rig (target y
  5.2), so backing away also goes DOWN: the camera landed at [0, -1.91, 36.76], under
  the hall floor. 768x1024 (x1.27) stayed just above it at y 0.63, which is why the
  tablet rendered.
- Fix: the dolly is now a spring arm (Unreal's `USpringArmComponent`, probe 12 cm): it
  extends only as far as the space behind the camera is clear — above the floor
  (y 0 + 0.12 m) for a camera authored above it, and inside `worldState.walkableAreas`
  for a camera authored inside them. What the arm cannot reach is made up with vertical
  fov ("Hor+"), so the promise "a phone sees at least what a square viewport sees" is
  kept. MOXIR at 390x844 now opens at [0, 0.12, 27.19], fov 73.7. Landscape and square
  viewports are untouched (scale 1), and a shot with room behind it (the front room)
  keeps the plain dolly.
- Also: at 390 px the rig's version row ran under Walk / Fly ("ly" visible). On a
  compact phone (≤ 560 px) with a right-hand control present, the row now takes its own
  line under it and the show chip moves one line down (`src/rigbuild/rigVersionLayout.js`).
- Guards: `cameraFraming.test.js` "fitCameraToAspect inside a room" (3 of 5 red on the
  old code), `publicViewerEntryCamera.test.js` "in an enclosed room",
  `rigVersionLayout.test.js`.
- Still open: the arm respects the declared floor and plan, not the geometry — a room
  with a wall inside its walkable rectangles (or none declared) can still put the arm
  through that wall. A geometry sweep (raycast along the arm after the room loads) is
  the full spring-arm method and is owed if a room shows it.
