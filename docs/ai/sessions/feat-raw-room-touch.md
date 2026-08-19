## 2026-08-19 — touch works in the room

Second of the three audit answers (first: the room behind the graph, PR #174).
Every fix below was REPRODUCED by hand before fixing and RE-MEASURED after —
the numbers are from driving the real UI.

- **Drag moved objects by teleport while orbiting the camera under them.**
  Measured: a 160px drag threw a sphere from [0,1.2,0] to [13.8,1.2,-9.9]. Two
  causes: the raw ground-plane hit was written straight into position (an
  elevated object's grab ray meets y=0 far behind it), and drei's
  OrbitControls listens on the DOM canvas, which R3F stopPropagation never
  reaches. Now: the grab offset is measured on a plane at the OBJECT's height
  (the first fix, on the floor plane, still gave a lever arm — 180px moved it
  4.2 units; at its own height, 2.1, hand-matched) and the controls are
  disabled for the drag's duration via R3F's makeDefault controls state.
- **Click on empty floor never deselected** — the invisible 400×400 drag plane
  catches the ray, so the Canvas-level onPointerMissed (which does clear) never
  fired. The plane now clears selection itself, guarded by R3F's event.delta so
  the click that ends a drag cannot clear what it just dragged.
- **Shift-drag lifts.** Ray intersected with a vertical camera-facing plane
  through the object; anchored to the drag-START position, because a lift that
  began with Shift already held baked a sideways step into its anchor
  (measured: z drifted −1.5 during a pure lift; now [0,1.2,0]→[0,2.27,0]).
- **Ctrl/Cmd+D duplicates** the selected node — the audit found no duplication
  path of any kind. Node alone, not its subtree (a deep clone with
  re-identified interior wiring is its own change), stepped +0.6/+0.6 in the
  room and +48px on the canvas so the copy never lands exactly on the original.
- The fullscreen room's `‹ graph` exit moved bottom-left — the first render
  put it exactly under the scope marker's own ‹ (seen).

### Verified

Driven end-to-end at 1440×900: select → deselect → 1:1 drag with the camera
still → pure vertical lift → duplicate landing beside the original, screenshot
read at each step. No console errors.

Still ahead (third answer): the clutter cut list — starter seed, CODE box,
title-bar text buttons, palette exact-match ("Out" summons an Outliner),
collision-free card placement, explainers into ⋯.
