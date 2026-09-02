## 2026-09-03 — Raw panel window polish: resize, wheel policy, canvas scale, bottom reserve

- Ported a set of Raw window fixes from an unpushed branch (bcd6b097,
  `feat/raw-one-surface`) onto current `dev`, keeping PR #312's pin/world
  model exactly (`frame.pinned === true` = screen pixels clamped to the
  viewport; otherwise graph units through the viewport transform). No
  `frame.space` field introduced.
- `DesktopWindow.jsx`: resize from every edge/corner (`RESIZE_DIRS`), with
  `setPointerCapture` on pointer-down and the pointer effect filtered by
  `pointerId` so a fast drag or a second finger can't drop/steal the
  gesture. `resizeFrame()` holds the non-dragged edge still. The SE grip is
  a real `<button>`; header + grip take arrow keys (16px / Shift 1px).
- `windowLayout.js`: `RAW_WINDOW_MIN_WIDTH`/`_MIN_HEIGHT` (200/120, was
  260/180), `getBottomReserve(viewportWidth)` (40 on ≥640px, 120 below), a
  `resizing` option on `clampWindowFrame` that caps growth against the
  window's own position instead of sliding its top-left corner up.
- `RawGraphSurface.jsx`: a wheel over `.raw-window-body` belongs to the
  panel unless ctrl/meta held; zoom step is now proportional to `deltaY`.
- `RawViewport.jsx`: `<Canvas resize={{..., offsetSize: true}}>` so a Scene
  window's canvas doesn't double-shrink under the viewport's own `scale()`.
- Phone overflow menu now fixes to the viewport below 640px (dev lacked it).
- NOT ported: "window follows its card" placement, sceneExample changes.
- Verified: `windowLayout.test.js` (30), `DesktopWindow.test.jsx` (13),
  `RawGraphSurface.test.jsx` (44) green. `npm run lint`/`test`/`build` — see
  PR. Headless Playwright at 1280×800 DPR2 on `/open/raw`: west resize grows
  leftward without moving the top edge; wheel over a window body leaves
  canvas zoom unchanged, wheel over empty canvas zooms; a Scene window's
  canvas fills its body at canvas zoom 0.7.
- Left open: panel windows are not DOM descendants of `.raw-graph-surface`
  (positioned via the published viewport, not nested in the stage), so the
  wheel guard's test builds the DOM shape directly since `RawGraphSurface`
  takes no `children` prop.
