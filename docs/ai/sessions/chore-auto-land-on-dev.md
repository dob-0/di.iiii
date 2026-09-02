## 2026-09-02 — dev folds its own session notes: the staging deploy lands them

- The single biggest source of failed deploys, measured: in the 14 days to today, 111
  merges into `dev`, 82 hand-run `chore(land)` fold commits, and a 60% failure rate on
  `Deploy VPS Staging`. Cause: every PR is REQUIRED to carry a `docs/ai/sessions/` note,
  so every merge commit puts a note on `dev`, and `docs:ai:check` (run inside the deploy
  via ci.yml) refuses a non-empty sessions dir on `dev`. Staging only moved once a human
  ran `npm run land` and pushed.
- Fix, two halves in `deploy-vps-staging.yml` + `ci.yml`:
  1. A first job `land` (push to `dev` only, `contents: write`, `continue-on-error`)
     checks out `dev`'s tip, runs `scripts/session-land.mjs`, and pushes the fold commit
     as `github-actions[bot]`. Fetch → re-fold → push, bounded to three tries, re-folding
     from the new tip instead of rebasing so a note merged in the gap is never left
     unfolded. No `npm ci` — the scripts import only node builtins.
  2. `ci.yml` gains a `workflow_call` input `land_in_place` (default false, so PRs and
     the production deploy are unchanged). The staging `test` job passes it, and the
     checkout is folded in place before any check runs — the tree under test is the
     tree the fold produces, whether or not the push in (1) was accepted.
- Why not "push and let the fold commit trigger the deploy": a `GITHUB_TOKEN` push
  never triggers another workflow. So there is no second run and no loop; this run
  deploys `github.sha`, the merge commit. The fold touches only `PROGRESS.md`,
  `CURRENT.md` and `docs/ai/sessions/`, so the image is the same code — accepted, and
  written into the workflow comments: `release.gitCommit` on staging reads one commit
  behind `dev`'s tip after a merge.
- The known unknown: `dev` has classic branch protection with required status checks
  (`build-and-test`, `browser-checks / browser-checks`) and no bypass for GitHub
  Actions (`enforce_admins` off is why the owner's hand pushes go through). A fresh
  fold commit cannot carry those checks, so the bot push will most likely be rejected
  (GH006) until the owner gives the github-actions app a bypass or moves `dev` to a
  ruleset with one. The job treats that as a warning, not a failure: staging deploys
  either way, and `npm run land` by hand remains the fallback for the bookkeeping
  commit. A live probe on a throwaway protected branch was prepared but not run (it
  needs a repo-settings write); the first real answer is this PR's own merge — read the
  `land` job's annotation on that run.
- `scripts/session-land.mjs`: with nothing to fold it now still runs the worktree
  sweep. CI folding cannot see anyone's disk, and without this the "landing sweeps it,
  not memory" rule would have quietly stopped being true the day the fold stopped being
  manual. Docs updated in the same change: sessions README, golden rule "CURRENT.md has
  exactly one writer", LIVE_DEPLOY.md, `.claude/commands/land.md`, parallel-agents.md.
- Validated locally: both workflows YAML-parse; `session-land.mjs --dry-run` against a
  planted note; lint, the session-land/repo-state unit tests, `docs:ai:check` and
  `docs:wiki:check` all pass. Not testable locally: the Actions run itself.
