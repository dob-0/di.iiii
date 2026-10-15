## 2026-10-13 — one command for the hand fold of session notes

- Added `scripts/fold-notes-branch.mjs` (`npm run land:branch`): the route of PR #894 in one command. On a clean `dev`, `--new` makes `chore/fold-notes-<today>`; on a `chore/fold-notes-*` branch it folds and commits. It calls the same three `session-land-lib` functions in the same order as `npm run land`, without that CLI's dev-only check or its worktree sweep. Refuses elsewhere, refuses a dirty tree, never pushes. `--dry-run`, `--no-commit`.
- Tested with a fixture notes dir (`scripts/fold-notes-branch.test.js`, 6 cases) and once by hand in a throwaway git repo (`--new` → branch, fold, commit).
- UNVERIFIED: a run against the real repo's 23 notes, and the push of a fold branch through the pre-push gate. Nothing user-visible changed, so no browser check applies.
