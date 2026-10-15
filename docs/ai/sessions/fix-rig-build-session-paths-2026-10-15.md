## 2026-10-15 — RIG_BUILD.md names PROGRESS.md, not two session notes the fold removes

- The dev deploy of #971 (run 38722625388) failed "Check AI docs". The test job folds `docs/ai/sessions/*.md` into `PROGRESS.md` in place, and then `docs/architecture/RIG_BUILD.md` named two notes that no longer existed (`feat-looks-heads-motion`, `feat-laser-lines-look`). Both lines now point at the folded entries in `PROGRESS.md`.
- Checked locally: `node scripts/session-land.mjs`, then `node scripts/check-doc-paths.mjs`, on a throwaway local `dev` branch.
- Still undone: a doc-paths rule that refuses a `docs/ai/sessions/` path outside the sessions folder before merge. The failure showed only after the merge, on dev.
