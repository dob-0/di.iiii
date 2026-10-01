## 2026-09-30 — docs gate lets a fold branch write CURRENT.md

- `scripts/check-agent-docs.mjs` refused any branch whose `CURRENT.md` differed from `origin/dev`, which blocked the hand fold `chore/fold-notes-after-670` in the pre-push hook. CI's `land` job cannot push to protected `dev` (GH006), so since 2026-09-29 the fold PR is the only route.
- The rule now skips branches named `chore/fold-notes-*` or `land/*` (`isFoldBranch` in `scripts/repo-state-lib.mjs`). Detached HEAD (CI) and every other branch keep the rule; the 50-line cap on `CURRENT.md` and all other checks apply to everyone.
- Guard: `scripts/check-agent-docs.fold-branch.test.js`.
