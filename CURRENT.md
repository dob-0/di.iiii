# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

(being committed this session — P0 fixes from the 2026-07-07 full audit; see below)
Before that: `55b9634` (Scene-panel entity-list cap) — committed AND pushed to `origin/dev`.
`main`/prod is behind `dev` by `2ef0884` + `55b9634` + this session; promotion planned this session.

## Last session (2026-07-07, part 3 — full audit + P0 fixes)

Ran a second full audit (app + **AI layer** + infra + landscape comparison). Report artifact:
<https://claude.ai/code/artifact/210249cb-5815-4db6-8acb-b0edf5b0fd85>. Key outputs:

- **All 20 open findings from the 07-07 six-agent audit transcribed into
  [docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)** — the durable tracker; check items
  off there as they're fixed.
- **Fixed this session** (with regression guards + known-fixes rows):
  gizmo icon mojibake (`GizmoModeButtons.jsx`), Shift+D double-duplicate / Delete double-fire
  (removed StudioShell's redundant key bindings; StudioEditor's guarded handler is canonical),
  all 7 jsx-a11y lint warnings (SpaceHub/StudioHub/BetaEditor.test) — **0-warning baseline restored**.
- **AI-layer drift corrected:** qa.md/backend.md stale test-count baselines → invariants;
  CHEATSHEET wrongly said contract/schema tests are "not in CI" (ci.yml runs both).
- **Housekeeping:** removed stale merged worktree in `.claude/worktrees/` + 4 more merged
  `worktree-*` branches; deleted stray `src/node_modules/.vite` cache.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth), Admin Ops Graph, GitHub → space sync live on prod
- VR/AR controller locomotion confirmed correct on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`
- Full suite green: lint 0/0, 412+ tests, 26 contracts, 0 npm vulns

## What is broken / open

- **[docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)** — 5 High, 7 Medium, 5 Low still
  open (camera-controls ref, syncRoutes fetch OOM class, schema-sync real comparison, rate
  limiting, socket reconnect, …) + dead-code sweep. Work plan order is at the bottom of that file.
- Drive on prod: staging verified; prod live-check + Google OAuth sensitive-scope verification
  (manual, user-only) still pending.
- GitHub-sync App webhook not yet exercised against a real repo push.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
