## 2026-10-13 — cloud: Studio, can a selection be moved while Select is on? Measured: yes, no failing gesture found

Owner: "when you select some objects and want to move them, you must un-press the Select button before you can move."
Base `fix/moxir-selection-box-and-scenes-2026-10-13` @ 713ee91a. No product code changed: nothing reproduced.

### How measured
`scripts/audit/studio-select-then-move.mjs` — local stack (`npm run dev`, scratch DATA_ROOT), account `walker`, project
`select-move` in `main`: a locked box place + three spot lights A (-2,1.5,0), B (0,1.5,0), C (1.5,0.5,0). Headless Chromium
1194 (SwiftShader), 1440×900 at DPR 2, real `page.mouse`/keyboard events. Edit + Select pressed, panels closed. Each gesture
starts from a fresh seed + reload. Screen points = the lamps' world points projected with the live r3f camera; the gizmo
arrow is found by hovering along +X until `TransformControls.axis === 'X'`. Moved = GET `/document` positions; ops = GET `/ops`.

### Before (base) per gesture — Select stayed `on` in every row
| gesture (Select on) | moved? | selection kept | ops |
|---|---|---|---|
| box-select A,B → gizmo +X arrow drag 120 px | yes, A +0.81, B +0.81 | yes (gizmo still attached) | 2 |
| box-select A,B → G, mouse, click | yes, +0.59…0.68 | yes | 2 |
| box-select A,B → G, mouse, Esc | no (cancel, as designed) | yes | 0 |
| box-select A,B → Move G button → gizmo drag | yes, +0.81 | yes | 2 |
| click A → gizmo drag | yes | yes | 1 |
| box-select A alone → gizmo drag / G click | yes / yes | yes | 1 / 1 |
| box-select A,B,C → gizmo drag | yes, all three | yes | 3 |
| box A, Shift+box C → gizmo drag | yes, A and C | yes | 2 |
| box A,B → gizmo drag as one 120 px jump (no intermediate moves) | yes | yes | 2 |
| box A,B → G, X, mouse, click | moved, but Y also changed (-0.26) | yes | 2 |
| box A,B → R, mouse, click | rotated (positions orbit the pivot) | yes | 2 |
| drag on empty space | no move; box drawn (`studio-box-select` seen) | selection replaced by the box | 0 |

After: identical (no change made). Tests before/after: not run — no code changed.

### Found, not fixed
- **G then X does not constrain to X** (A moved Y 1.5 → 1.24 and z 0.07). It does the same with Select OFF
  (A click-selected, G, X: Y 1.5 → 1.27), so it is not a Select problem; not in this brief. Cause UNVERIFIED (keys sent
  as `press('g')`,`press('x')` back to back; maybe the real order matters). Size S–M, owner's call.
- The walk's "selection kept" reads only the gizmo being attached; the Objects-row reading (`OBJ_ROWS=1`) returned 0 rows
  and is not trusted.

### UNVERIFIED
- The owner's own failure: not reproduced. Real GPU, a real mouse, touch/pen on a tablet (BoxSelect ignores touch
  pointers), a real MOXIR project (instanced rig bodies), lamps nested in groups, and a build older than the 13:2x fix
  that made the gizmo mount in Select (comment in `StudioViewport.jsx` SelectableEntity) — the report may predate it.
- Fragile by reading, untouched: BoxSelect decides a drag is the gizmo's from `camera-controls.enabled` at the first 4 px
  of movement; ModalTransform/walk also flip that flag. No measured failure came from it.

Next: owner says on which build and device it failed (and whether the Select button was lit by Select or by B); with that,
re-run the script against that tier (`--base`). Then G+X.
