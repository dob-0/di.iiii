## 2026-10-28 — PR #897 brought up to today's dev

- Merged `origin/dev` into `cloud/fold-notes-2026-10-13` (493 commits behind); the only conflict was `CURRENT.md`, taken whole from dev.
- `scripts/session-land.mjs` already uses `planFold`/`applyFold` from `fold-notes-branch.mjs`; dev's version of the rest is unchanged.
- Tested: lint, build, the fold-notes, session-land-lib and check-agent-docs.fold-notes tests.
- Not tested: a run of `land:branch` against the real notes; the full suite (CI runs it).
