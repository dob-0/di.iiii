## 2026-09-30 — scene deck layer 1: the scene model, four controls, undo and the here/there sync compare

- Owner, 2026-09-30: "A and B is ok, without names and things; imagine there is also the other organizer where
  we need to sync things there … keep it all right that we can use it in future." This branch is LAYER 1 only:
  pure logic in `src/rigbuild/sceneDeck/` (model, controls, history, hash, sync compare, carried file), on top of
  the two MOXIR ground versions from `fix/ground-real-lights`. Documented in RIG_BUILD.md §21.
- Tests: `npx vitest run rigbuild/sceneDeck` — 22 pass with the code; with the six source files moved aside the
  suite fails to load (0 of 22 run). Fixtures are the real minimal-ground / full-ground rig and show files, put
  into a document by the ops `looks.mjs` and `show-cues.mjs` send. `eslint src/rigbuild/sceneDeck`: 0 problems.
- Measured on the fixtures: minimal-ground loop 79 s (8 scenes), full-ground 81 s (10 scenes); the blinder is
  `truss/up-cob200`, the laser `truss-top/up-la40wf`; only `gs-laser-roof` carries the sign-off marker.
- NOT seen on a screen: there is no UI yet. Nothing here talks to a server or a running install.
- Honest limits: colour temperature is not a field (a hex stands in); a look has no strobe rate, and the
  3 flashes/s cap (WCAG 2.3.1) is not imported here — TODO: layer 2 must enforce the cap in every preview and on
  the desk. The schema has no per-look op, so a look change rewrites the look list whole (last-writer-wins for two
  simultaneous edits on one install; owed: a per-look op). The loop order is not part of a scene's hash (a reorder
  is not detected yet).
- What layer 2 (screens A and B) needs from this: `readScenes` for the deck and the timeline; `applyControl` for
  the four controls (show `SceneDeckError.code` in words); `historyReducer` for undo / redo / restore last good;
  a place to keep the last-common hashes per scene (the sync ledger, owed) and a transport — first the carried
  file (`exportBundle` / `parseBundle`), then the network; the four marks from `compareScenes` and the three
  buttons from `planSync`, with the restore point taken before any take-theirs. B's retime (hold of two
  neighbours) is not a control here yet; `guardSceneChange` already refuses a loop outside 60-90 s.
