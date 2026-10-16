# fix/pr1008-spine — CI fix for PR #1008 (scene bar pinned)

Date: 2026-10-17. Branch of `fix/studio-scene-bar-pinned-2026-10-16` (PR #1008), pushed onto it.

## What and why

- Why: node-22-compat and build-and-test failed on `src/styles/spine.test.js` — the sticky scene-bar header carried
  `background: rgb(4, 6, 14)`, a colour literal outside base.css.
- Change: `var(--di-surface)` instead (the studio's own surface token). Spine test 322 passed locally.
- Full story: `docs/ai/sessions/fix-studio-scene-bar-pinned-2026-10-16.md`.
