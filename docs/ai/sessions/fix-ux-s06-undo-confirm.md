## 2026-10-28 — Undo and Redo buttons on the plot and build; the light desk asks one way

- UX audit slice S06 (F041, F042), base db7d9c667. The plot and build pages show Undo and Redo buttons (the same `undo`/`redo` as Ctrl+Z; none for a read-only visitor or the crew view). Files: `PlotSurface.jsx`, `BuildSurface.jsx`, `plot.css`, `build.css`.
- The light desk's destructive steps all ask through one helper, `serverXR/src/lighting/ui/ask.js` (`deskAsk.ask`): a bar that never blocks the page. The six native `confirm()` calls and the `armThen` "Sure?" two-step (7 call sites, now `askThen`) are gone. The desk keeps its own design: only the ask changed.
- Tests: `src/rigbuild/undoButtons.test.jsx`, `src/map/deskAsk.test.js`. Wiki: `lighting-plot`, `lighting-desk` updated 2026-10-28. Known-fixes rows added.
- Not done: the audit's "act at once and offer Undo for ten seconds" is NOT built (it needs undo on the desk's server, a larger change); the destructive steps ask first, in one way. Not driven on the scratch desk: a real unpatch/scene delete click (needs a patched rig); the bar was opened by calling `deskAsk.ask`. Build page seen only by source test, not by screenshot.
