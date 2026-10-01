## 2026-10-01 — Studio viewport toolbar: 6 px corners → 2 px (controls are rectangles)

- Handover item (feat-moxir-work-light-2026-10-01.md, "TOOLBAR_BTN 6→2 px"), done on the PONYO laptop. Cut from `feat/moxir-work-light-2026-10-01` (4f7fd530, the `.14` review line + work light).
- `src/studio/components/StudioViewport.jsx`: `TOOLBAR_BTN` 6px → 2px, and the two 30 px corner buttons in the same file (Fullscreen, the `?` above it) 6 → 2. `SmartViewBar.jsx` loses its "the toolbar's own 6 px corners are owed the same" note.
- Guard: `src/rigbuild/controlsAreRectangles.test.js` now sweeps `StudioViewport.jsx`. Seen failing first, on exactly the three lines (838, 887, 1180), then passing.
- The same test failed on Windows before this change: `relative()` gives `src\rigbuild\…` and the allow-list says `src/rigbuild/…`, so the recording dot in `RoomLookFollower.jsx` was flagged. Paths are now joined with `/` before matching. Linux CI was never affected.
- Validation: vitest `controlsAreRectangles` + `StudioViewportLayout` + `SmartViewBar` = 3 files, 11 tests pass (Node 24.18, Windows); eslint clean on the three files. Looked at in Chrome at 1440×900 and 390×844 on `/moxir/studio/projects/moxir-hall-minimal-ground`: every toolbar and corner button computes 2px.
- Found, not fixed (outside this item): the phone Studio layout still draws pills (999px): `←`, Nodes, Projection, Edit, the cue chips and the "Tap an object" hint. Not in `StudioViewport.jsx`; worth its own branch and a sweep entry.
