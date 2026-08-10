# fix/dev-stack-drift-guard

## 2026-08-10 — stale-tree guard for the main checkout

- Root cause being guarded: the main checkout sat parked on a merged feature branch,
  far behind origin/dev, and `npm run dev:browser` served it for two days with nothing
  saying so.
- `scripts/dev-stack.mjs` now prints the tree position (branch/detached, short sha,
  behind-count vs the local origin/dev ref) at startup, and a loud STALE/DRIFTED
  warning with the fix command when HEAD is off the origin/dev tip or the branch's
  upstream is gone. Read-only, no fetch (offline is a real case), degrades to silence
  if git is unavailable.
- `scripts/repo-state.mjs` + `repo-state-lib.mjs`: `npm run state` now warns on the two
  shapes the old warnings missed — detached (or local dev) HEAD behind origin/dev, and
  a current branch whose upstream is gone. Tests added in `scripts/repo-state.test.js`.
- `docs/ai/parallel-agents.md` gained The Parking Rule: the main checkout is the user's
  viewing surface; leave it detached at origin/dev before a session ends; all branch
  work lives in `.claude/worktrees/`.
- Known-fixes row added for the incident (symptom: dev stack silently serving old code).
- Deliberately not touched: CURRENT.md (feature branches may not), no fetch at stack
  startup (offline desktop is a real case — counts run against the local origin/dev ref).
