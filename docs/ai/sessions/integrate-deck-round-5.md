## Deck round 5: live wall + newest lights on top of round 4

Branch `integrate/deck-round-5`, built from `integrate/deck-round-4` (b9955183c, pull request 1277).

### Merged
- `feat/deck-wall-live` at 8f281786c (the live wall: the 3D scene wall shows the deck output). Its tests liveWall.test.js, LiveWall.test.jsx, wall-live.test.js ran for the first time in CI on this branch.
- `feat/platina-lights` at 28e1fedb0 (the lights line), then again at 9445319f8 (haze machines get their own channels per look), one merge commit each.
- `origin/dev` at 24b923148 (it moved after the first push, so it was merged in a third merge commit).

### Skipped
- `integrate/deck-round-3` (f834d8a8c): pull request 1275 showed failing checks (build-and-test, node-22-compat, test shard 2/3) when checked, so it was left to the job that fixes it.

### Conflicts
- `docs/ai/known-fixes.md` (deck-wall-live merge and dev merge): append-only, both sides' entries kept (union).

### Words fix
- `src/wiki/wikiContent.js`: the live wall text said Room; reworded to Scene (words test).

### Not tested
- Nothing was run locally except `npm run start-check`. Tests, lint and build ran only in GitHub CI.
- Nothing was looked at on a screen or on the show machine.
