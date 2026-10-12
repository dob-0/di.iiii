# feat/studio-lock-keys-2026-10-13

## What was done
- D1: `lockFromKey` (editKeys.js) + handler in StudioEditor.jsx: L locks selection, Alt+L unlocks all; same batch as the Inspector button.
- D2: BoxSelect already honoured Shift/Ctrl (boxModeFor). BoxSelect.test.jsx proves plain/Shift/Ctrl drags; no code change.
- D3: key help is `utils/studioGuide.js` (not StudioControlCluster); wiki article `studio-basics` updated 2026-10-13.
- D4: lamp bodies (rigbuild/FixtureBodies instancedMesh) had no click handler, so a click selected nothing; `onPick` prop added (RigBodies -> StudioViewport -> `pickLampBody`, locked ignored).
- Tests: `npx vitest run src/studio src/rigbuild`.
