## 2026-09-28 — one flow for every hand: git hooks and an "only on this machine" check

- Why: a collaborator's laptop (Emilya's, `ponyo`) held 22 commits and ~60 changed files on no remote,
  the oldest 25 days old, and work in progress sat uncommitted on `dev`. Nothing flagged it — start-check
  answers "am I behind?", not "is my work anywhere but here?". Rules written only for Claude also don't
  reach someone typing git by hand or using another assistant.
- New `scripts/git-hooks/pre-commit` (refuses a commit on `dev`/`main`) and `pre-push` (refuses a push
  that writes `dev`/`main`, then runs the push checks). They're switched on by `npm install` via the
  `prepare` script `scripts/install-git-hooks.mjs`, which skips CI (deploy-vps-dev.yml pushes to dev by
  design), non-git trees (Docker), `DI_NO_GIT_HOOKS=1`, and an existing custom hooksPath.
- The push checks moved from `pre-push-gate.sh` into `scripts/push-checks.sh`, so there is one copy.
  The Claude Code hook now defers to the git hook when it's installed AND present on the branch (older
  branches without `scripts/git-hooks` still get the checks from the Claude hook).
- New `scripts/unsaved-lib.mjs` + `npm run unsaved -- <folders>`: every git repo under the folders, with
  its unpushed branches (with age), uncommitted files per worktree, stashes and no-remote repos; exits 1
  when anything is only here. `npm run start-check` gained an "only on this machine" section (this
  checkout only, outside the LATEST verdict).
- Tests: `scripts/unsaved-lib.test.js` runs real git in a temp dir (no mocks) and covers the hooks'
  refusals; start-check's existing tests still pass (49/49 across both files).
- Measured on aylmo at the time of writing: 11 local branches with commits on no remote (oldest 25 days)
  and several worktrees with an untracked `.verify/` scratch folder, which the check reports as-is.
- Owed: a Windows scheduled task on a collaborator's machine that runs `npm run unsaved` daily and raises
  a non-zero exit; not built in this branch.
