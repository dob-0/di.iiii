## Laser sends time out at 4 s; a new Screen skips a surface whose deck was deleted (review N3876, 2026-11-12)

- `src/map/laserLink.js`: `postLaser` races a 4 s timer (`LASER_POST_TIMEOUT_MS`), aborts the fetch, answers `false`.
- `src/studio/utils/screenOps.js`: `findPictureSurface` reuses a `network` surface only when its `ref` is a node still in the document.
- Guards: `src/map/laserLink.test.js`, two cases in `src/studio/utils/screenOps.test.js`; entry in `docs/ai/known-fixes.md`.
- Tested: vitest on laserLink, blackoutPlan and screenOps, 3 files and 23 tests passed. Not tested: a real hung laser engine, the Studio UI in a browser.
- Review findings left open for the owner: a video-to-Screen swap deletes the video's children (undo restores them); a Screen takes the first picture surface, not the preferred deck.
