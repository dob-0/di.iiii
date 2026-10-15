## 2026-10-15 — The loading ring (PR #963) merged into the show branch

Branch `feat/loading-ring-into-show-2026-10-15`, from the show branch `feat/moxir-v2-10-forty-2026-10-15`. Owner: the ring must be on
moxir-test, not only on dev.

- Merged `feat/loading-ring-everywhere-2026-10-15`; 4 conflicts, all kept both sides: `docs/ai/known-fixes.md` and `docs/ai/vocabulary.md`
  (append-both), the import blocks of `src/components/LiveProjectScene.jsx` and `src/rigbuild/RoomLookFollower.jsx` (the show branch's
  imports + `LoadingScreen`). No logic dropped.
- Measured: vitest on src/components, src/rigbuild, src/project/components 3192 pass, 2 fail (SceneEditor line-L, noSupplierPrices rigs;
  both fail the same on the show branch before the merge); eslint 0 errors; vite build ok (needs `uqr`, missing from the shared node_modules).
- Not seen on a screen: no browser was run for this merge.
