## 2026-09-16 — batch land: space history + start check

- Batched two independent, non-overlapping reviewed PRs onto `dev` in one CI round:
  `feat/space-history` (#470, every space change gets an author and a way back) and
  `feat/start-check` (#472, a start-of-session/pre-push check for code and space
  content lines). No shared files between them.
- Merged both with `--no-ff` into `land/history-startcheck-2026-09-16`, cut from
  `origin/dev`. Their own session notes (`feat-space-history.md`, `feat-start-check.md`)
  are left in place — folding happens on `dev` via `npm run land` (the staging deploy's
  `land` job runs it automatically after this lands), not on this branch.
