# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

P0 fixes (`e65bf16` + `e02a1d2`) are **live on prod** (dev→staging→main promoted, smoke 9/9 on
both). P1 security + P2 reliability batch is being committed/pushed now — see below.

## Last session (2026-07-07, part 3 — full audit + P0/P1/P2 fixes)

**P1 security (serverXR):** rate limiting on guest-sessions/login/OAuth/sync-key/uploads
(`rateLimit.js`); startup warning on `AUTH_SESSION_SECRET`→token fallback; WCC postMessage
origin check; Drive `folderId` escaping; syncRoutes off global fetch + a contract test banning
global fetch repo-server-wide. **P2 reliability:** Studio camera-controls ref rewired (fixes
save-view, frame-selected, click placement, XR restore, saved-view-on-load); socket reconnect
after unexpected disconnects; V1-scene asset delete guard; image-load placeholder; portal via
`appNavigate`. All with regression guards; suite 430/430, contracts 29/29.

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

- **[docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)** — ALL High/Medium items are now
  closed with guards (incl. the schema-mirror drift: CJS was silently turning lights/groups into
  boxes server-side — real equivalence test added). Still open: 3 Low (export credentials,
  capture-rule/data-cleanup sharp edges, wiki freshness) + dead-code sweep (~1,800 lines).
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
