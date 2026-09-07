## 2026-09-07 — a new panel window opens whole on screen; a wired port reads as wired

- Festival-machine inventory (2026-09-06) gap: in `/open/raw` a panel node placed low or
  right on the screen opened its window partly outside the viewport (reproduced twice,
  prod too). Cause: `buildNodeValues` hands over a frame that is screen arithmetic
  around the click (`clientX − 180`, `clientY − 36`), but since windows moved into the
  world (2026-09-03) an unpinned frame is GRAPH units placed through the canvas
  viewport — pan and origin away from the click, and never clamped.
- Fix: `placeNewWindowFrame` in `src/raw/utils/windowLayout.js`. A new window opens
  against its own card — below it, else above, else beside — and the winning spot is
  pulled wholly inside the viewport by the same `clampWindowFrame` DesktopWindow
  applies, so the phone's x=12/width=366 layout is respected, not re-derived. It
  answers in graph units for world windows (size preserved at any zoom) and in screen
  pixels for pinned/phone windows. Only creation goes through it (palette create and
  file drop in `RawEditor.jsx`); a window a person dragged is never re-placed, and
  stored patch frames are untouched data.
- The card box (`CARD_WIDTH`, `cardHeight`) moved out of `RawGraphSurface.jsx` into
  `src/raw/utils/cardGeometry.js` so the editor and the surface agree where a card
  ends; the surface's numbers did not change (`graphGeometry.test.jsx` still green).
- Same area, minor: the inspector offered an editable box for an input port that has a
  wire into it, and a typed value was silently ignored. `deriveNodeInspectorSections`
  now takes `wiredPortIds` and marks those fields; `PropertyInspector` renders them
  disabled with a small "wired" hint and a title explaining that unplugging the wire
  lets you type. Field stays visible — a box that vanishes when a wire lands reads as
  a bug.
- Verified: vitest `windowLayout.test.js` (placement at 1440x900, a 620-tall viewport,
  zoom 0.5, 390x844 phone, no viewport yet, nothing to open against),
  `nodeInspectorSections.test.js`, `PropertyInspector.test.jsx`, plus every test under
  `src/raw` and `src/project/graph` — all green; eslint zero errors (warnings are
  dev's own, two fewer than before). Seen: own stack on 4147/4148, headless Chromium
  at DPR 2 — double-click at (1330,820) and (720,840) on 1440x900 and at (300,700) on
  390x844, place Agent: every window `getBoundingClientRect` inside the viewport,
  above the card and clear of it; the Cube inspector with a Colour wire shows
  "Colour WIRED" disabled, Size still live; zero console errors.
- Not done: the phone card itself can land under the zoom toolbar when the tap is
  near the bottom (pre-existing card placement, not the window) — outside this lane.
