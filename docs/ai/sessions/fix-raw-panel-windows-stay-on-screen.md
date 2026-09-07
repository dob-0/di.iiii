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
- Review of PR #393 (2026-09-07): `placeNewWindowFrame` ran the window's SCREEN size
  through `clampWindowFrame`, whose 200x120 floor is screen pixels, then divided back
  by zoom — so a world window placed at 5% was stored 4000x2400 (reviewer measured it;
  the unit test at zoom 0.5 sat above the ~0.3 threshold and missed it). Fix:
  `clampWindowFrame` takes optional `minWidth`/`minHeight` (defaults unchanged for its
  other callers) and the placement passes the world minimum scaled by zoom, which is
  exactly `worldSettle`'s 200x120 graph-unit floor as seen on screen. Same class, same
  fix: the 16px gap to the card was screen pixels too (320 graph units at 5%, the
  window a screen away from its card once zoom came back), now `RAW_NEW_WINDOW_GAP`
  graph units for a world window. Tests: `it.each` over zoom 0.5/0.25/0.1/0.05 keeps
  420x480, a tiny frame is raised to 200x120 graph units, the gap is graph units at
  0.1, zoom 3 only shrinks. Seen on a fresh stack (serverXR 4171 + vite 4172, headless
  Chromium 1440x900 at DPR 2): a first Agent at 100%, toolbar to 5%, a second Agent —
  stored frame 360x280, y = card bottom + 16, rendered 18x14px directly under its
  10x4px card; back at 105% it renders 380x297 (authored x zoom), 14px under the card.
  At 300% the second window is stored 360x264 (height capped by the viewport, never
  grown); nothing fits beside a card that big, so the below-and-clamped fallback
  covers it — the branch's documented fallback, unchanged. Note: on an EMPTY canvas
  the first node triggers the surface's one-time fit, which is why a lone placement at
  5% reads as 100% afterwards — pre-existing and by design.
- Not done: the phone card itself can land under the zoom toolbar when the tap is
  near the bottom (pre-existing card placement, not the window) — outside this lane.
