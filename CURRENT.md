# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `8dcf55f5` (rebased onto 18 commits landed by other sessions today) —
dev-only `/api` proxy fix, golden rule on rendering generated Studio HTML
before push, session-log update. Notable in the rebased-onto range: VPS
GHCR+SSH deploy pipeline for `main` (#60), nginx hardening + WCC routing fix,
brand assets wired from the brand kit (#65), br_id_ge hierarchy sort bug
fixed (#50). `main` = `3e88adba` — **production DNS is now fully cut over to
the Hetzner VPS** (Docker/Caddy), not cPanel.

## Last session (2026-07-15 — di.i brand toolkit + open_space 3D fix)

- Built the di.i brand-guide/export toolkit (scratchpad, not repo); v1
  (nested-square mark/black-cyan/Inter) kept live, v2 "weave" archived in
  the `brand-directions` Studio project. Pushed to `brand-guide` (v10).
- Fixed live homepage `main-dii-project` ("open_space") 3D scene: brand-token
  colors, relit, real `worldState.spawn` near the sculpture path.
- Fixed dev-only `vite.config.js` bug: bare `/api/*` wasn't proxied (only
  `/serverXR/*` was), so local dev silently served HTML instead of asset
  bytes for anything requesting bare `/api` paths. Committed.
- New golden rule: render generated Studio `codeHtml` in a real headless
  browser before pushing — root cause of two silent blank-page pushes
  this session (`</style>`-deletion swallowed the whole doc as CSS).
- Also (2026-07-14) br_id_ge homepage/hierarchy work, pushed as `43b5c387`
  — superseded by `08669f50`'s fix to the same sort (key mismatch).

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Production is live on the VPS (Docker/Caddy) as of today; cPanel auto-publish
  is disabled (workflow_dispatch only) — its smoke-check was failing anyway
  since DNS cutover.

## Open

- **Staging deploy target is currently undefined.** `publish-cpanel-prebuilt-v2.yml`'s
  push trigger was removed for both `main` and `dev`; `deploy-vps.yml` only
  triggers on `main`. A `dev`/staging push right now auto-deploys nowhere —
  decide whether staging moves to the VPS (separate host/compose profile) or
  gets a manual-dispatch cPanel deploy for now.
  `docs/deploy/LIVE_DEPLOY.md` still describes the old cPanel-only golden
  path and needs a rewrite to match.
- Manual click-through still owed: homepage buttons, br_id_ge dropdown
  order/cross-nav — now doubly worth re-checking since `08669f50` changed
  the same sort logic after `43b5c387`.
- Brand: canonical domain/handle still undecided (di-studio.xyz vs
  thedi.studio vs IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow (now against
  the VPS-hosted prod, not cPanel).
- ANSCC research-grant angle for `br_id_ge` — user wants ~1 month before
  writing an actual research case, if pursued at all.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin main       # now deploys to the VPS (GHCR + SSH), see deploy-vps.yml
git push origin dev        # no auto-deploy target right now — see Open above
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
