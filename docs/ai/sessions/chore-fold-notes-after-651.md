## 2026-09-29 — two waiting notes folded into PROGRESS: the Windows docs check (#651) and the previous fold

- The land job's push to dev is still refused by branch protection (see the 09-22 known issue), so
  notes pile up on dev; Emilya's agent saw `docs:ai:check` fail on dev with two waiting notes.
- Folded with `foldNotesIntoProgress` (scripts/session-land-lib.mjs) on a branch, as the 09-29
  fold after #652 did; CURRENT.md untouched. `npm run land` itself refuses off dev, and a commit on
  dev is now refused by the git hooks (#612/#639) — a branch + PR is the only route.
