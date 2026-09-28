## 2026-09-29 — the git hooks reach every worktree, whatever its branch

- Found on aylmo right after #612: with `core.hooksPath = scripts/git-hooks` (relative, shared by all
  worktrees) the main checkout, parked on an older `dev`, had no hook files, and a test commit on `dev`
  went through (undone at once with `git reset --soft HEAD~1`; nothing pushed).
- `scripts/install-git-hooks.mjs` now copies `scripts/git-hooks/*` into `<git common dir>/di-hooks`
  (with a SOURCE.txt naming the commit) and sets that absolute path; the old relative value is replaced.
  `pre-push` keeps the dev/main guard everywhere and skips only the checks on a branch that predates
  `push-checks.sh` (that branch still carries the older Claude gate with the checks inline). The Claude
  gate defers whenever the installed pre-push runs push-checks.
- Guard: `scripts/unsaved-lib.test.js` "covers a checkout whose branch predates the hooks" — real git,
  seen failing against the previous installer, passing now (50/50 with start-check's tests).
- Applied on aylmo: `core.hooksPath` = `/home/dob/work/di.iiii/.git/di-hooks`; a commit on `dev` in the
  main checkout is now REFUSED (seen).
