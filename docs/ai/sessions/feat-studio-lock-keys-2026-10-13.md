# feat/studio-lock-keys-2026-10-13
- D1: `lockFromKey` (editKeys.js) + handler in StudioEditor.jsx: L locks selection, Alt+L unlocks all; same batch as the Inspector button.
- D2: BoxSelect already honoured Shift/Ctrl (boxModeFor). Added BoxSelect.test.jsx proving plain/Shift/Ctrl drags; no code change needed.
- D3: key help is `utils/studioGuide.js` (not StudioControlCluster); wiki article `studio-basics` updated 2026-10-13.
- Tests: `npx vitest run src/studio`.
