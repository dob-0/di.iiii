## 2026-09-30 — front-door "hardcoded auto-frame 0.8,0.45,1" and the phone exit: what they really were

- The CURRENT.md diagnosis was half right. `0.8, 0.45, 1` is a camera DIRECTION (centre -> camera,
  three-quarter from front-right, above the floor), not a position or a fit. Distance was already
  fitted from the bounding sphere and the viewport aspect in `computeFramingCamera`.
- The `main` room never reaches it: its document is `entryView: 'fixed-camera'` with
  `fixedCamera [0,3,14.5] -> [0,1.2,-14]` fov 50 (read from the local tier and from the
  di-spaces backup), so `resolveViewerCamera` takes the authored lane + `fitCameraToAspect`.
  Auto-frame only serves `entryView: 'scene'` rooms.
- The place the constant DID hide a real bug: Studio "Frame selected" (`StudioEditor.jsx`
  `handleFrameSelected`) carried its own copy of the literal AND its own vertical-only distance
  (`radius / sin(vFov/2)`), the drifted twin of the fix that #286 made in `cameraFraming.js`.
  On a portrait viewport it cropped the selection at the sides. It now uses `computeFitDistance`
  (radius / sin(limiting half fov), limiting = min(vertical, atan(tan(vFov/2) * aspect))) with the
  camera's own aspect, and the direction is the one exported constant `DEFAULT_FRAMING_DIRECTION`.
  Landscape is byte-identical (limiting fov is vertical for aspect >= 1). No other room's behaviour
  changed; an authored camera is still respected.
- Guard: `src/utils/cameraFraming.test.js` "bounding-sphere fit" (landscape R/sin(25 deg); portrait
  390x844 R/sin(atan(tan25 * 0.462)); ratio 1.9-2.2).
- Phone exit: NOT a live defect. The bare Raw canvas wordmark (link home) was moved to the top-left
  on <=640 px, 44 px tall, in fe00ef62 (2026-08-22); the CURRENT.md line is stale. Same control as
  desktop. Pinned by `src/raw/phoneExit.test.js`. Owed: CURRENT.md line to be dropped by `npm run land`.
- Not fixed, named: on a hosted install the published `main` room opened bare (`/main`) suppresses
  `MadeWithBadge` (`homeIsThisRoom`), but `/` is the landing again, so that room has no visible exit
  on desktop or phone. Owner's call (it adds a control to the room).
- Landing REST_POSE is not aspect-fitted on a phone (outer doors cropped for the first frames of the
  flight); the page covers it. Owed if the flight is ever shown bare.
