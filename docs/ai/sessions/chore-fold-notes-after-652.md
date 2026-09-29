## 2026-09-29 — ten waiting notes folded into PROGRESS: private projects (#652), the sign-in hub batch, vitest 5, live AI restyle, unsaved watch, hooks in every worktree, docker prepare hook, kit grid, unsaved-log BOM, the rig-builder fold

- The dev deploy of #652 stopped at "Check AI docs": the in-place fold of ten waiting notes
  (the land job's push to dev is refused by branch protection, so they pile up) made
  CURRENT.md 51 lines, one over its cap.
- Folded with `foldNotesIntoProgress` (scripts/session-land-lib.mjs, the same function
  `npm run land` and CI use) on a branch instead of pushing to dev: PROGRESS.md carries all
  ten, the note files are gone, and CURRENT.md is untouched here — the merge's own fold
  writes its "Last session" from this one note.
