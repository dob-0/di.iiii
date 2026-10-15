# cloud/studio-walk-build-2026-10-14

## 2026-10-14 — the Studio walk builds, Minecraft style

- Owner (2026-10-13): "walk mode in studio can be the minecraft style one … h hotkey hide the ui and just look".
- Shared parts moved out of the rig Build surface into modules both import: `rigbuild/BuildHotbar.jsx` (the strip),
  `rigbuild/useHotbar.js` (slots, slot in hand, pins), `rigbuild/buildActions.js` (place / remove as ops). `/build` uses them.
- `useWalkNavigation.setWalkBuilder`: while a builder is registered the walk hands it keys and clicks first; no builder
  (the public viewer) = the walk as before. `src/studio/walkBuild/` is the Studio's builder; edits go through
  `applyLocalOps` of `useOpHistory` (the one writer), so Ctrl+Z undoes them.
- Not done: no ghost outline in the canvas, no wheel to cycle slots, Q/Z height steps, touch. See the PR.
