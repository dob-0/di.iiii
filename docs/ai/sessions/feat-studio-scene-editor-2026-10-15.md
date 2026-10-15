# feat/studio-scene-editor-2026-10-15 — every scene editable in the Studio

## What was built and where it now lives
- `src/shared/buildLook.js` — the ONE build function (parts → colours/levels/aims), used by `scripts/rigbuild/epic-build.mjs` and the Studio.
- Schema: look source fields (`parts`, `laser_colour`, `desk_caps`, `act`) and `rigParts` on the show entity (`src/shared/projectSchema.js` + `shared/projectSchema.cjs`).
- `src/studio/utils/sceneEdit.js` (pure: rebuild ops, flash rule, heads warning, new/duplicate/delete/move), `playScene.js`, `SceneEditor.jsx`, ScenePicker wiring (`onSceneOps`, `onPlayScene` through Editor → Shell → Layout → Surface → Viewport).
- Docs: RIG_BUILD.md §25, wiki article `studio-edit-a-scene` (new category Studio). Vocabulary: no new words; "scene" is used as the brief says (a look + its cue), the dictionary row's open question about it is untouched.
- Nothing left behind: no production name in any default; the v2-11 rig is only a test fixture.

## Open
- The owner's look at the editor; the desk's Play needs a desk on the stack (scratch has none).
- `lookKey` drops keys with parentheses (plane 1 (behind the DJ)): pre-existing, owed.
- `desk_caps` not editable in the UI.
