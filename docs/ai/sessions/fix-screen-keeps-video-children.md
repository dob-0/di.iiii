## Video to Screen keeps the objects inside the video (owner N3967, N3971, 2026-11-12)

- `src/studio/utils/screenOps.js`: `buildVideoToScreenOps` moves the video's direct children under the new Screen before deleting the video; returns `movedChildren`.
- Guard: new case in `src/studio/utils/screenOps.test.js` (apply + invert round trip); entry in `docs/ai/known-fixes.md`.
- Tested: vitest screenOps 13 passed. Not tested: Studio UI in a browser. Limit: an unrotated video becomes an upright Screen; its children turn with it.
