## 2026-10-08 — pan and zoom follow the surface under the pointer (Auto Depth for the studio preset)

- Owner: "when I zoom with the scroll it zooms, but when I click right and move left/right it is stuck." Tested like a person with real mouse
  events on the RTX 3080 (di-test-browser, desktop 3), camera position logged every frame, in Inside, Free and Studio.
- Measured BEFORE: after the wheel zoomed in, a 240 px right-drag moved the camera 0.11 m (Free, Studio) / 0.64 m (Inside) in a 100 m hall:
  camera-controls pans in proportion to the distance to its orbit point, which sat 0.35 m away in open air. In the public viewer
  camera-controls reported `active` at the start of every gesture, so the existing Auto Depth code (which refuses mid-ease) never ran.
- Fix: the studio preset gets Auto Depth ON for PAN and ZOOM (not rotate: re-pivoting an orbit onto a surface 50 m away swept the camera
  30 m in a frame, measured); a gesture's start stops any easing (`settleForGesture`) and forces its pivot (`applyPivot(..., {force})`).
  Buttons unchanged. `mappings.test.js` had pinned `autoDepth: false` as the old literal: changed on purpose, with the reason in the test.
- Measured AFTER (240 px right-drag, net metres): Inside 0.64 -> 1.13, Studio 0.11 -> 8.84 (pan), Free 0.11 -> 0.20; no frame jumped more than
  0.03 m (Inside) / 0.22 m (Studio) while panning. Wheel zoom and orbit unchanged in Inside.
- NOT fixed / found: Free still pans 0.2 m per 240 px when the camera is pressed against a surface at the 0.35 m minimum distance (physically
  consistent; zoom out); Studio wheel zoom is very fast (25 big notches: ~600 m, 180-215 m in one frame at 500 m); middle-drag does nothing in
  Inside/Free; Studio opens with three overlapping floating panels over the 3D view and truncated titles. All raised with the owner.
- Not seen by the owner's hands yet.
