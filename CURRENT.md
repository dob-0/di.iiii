# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`07084e2` — **live on prod** (`dev` == `main`, prod smoke 9/9, 2026-07-08 morning).

## Last session (2026-07-08 — GitHub sync proven end-to-end, promoted to prod)

- Validated the no-code connect flow live on staging (install → dropdown self-populates →
  one-pick connect → initial sync), using `br_id_ge`.
- Promoted `dev`→`main` (deploy green, prod smoke 9/9) — no-code GitHub sync UI now on prod.
- Proved the webhook for real: push `17e88729f8` to private `dob-0/di-sync-webhook-test`
  auto-synced prod space `webhook-test` with zero admin interaction — last audit box closed.
- Found `serverXR/.env.local` holds a stale pre-rotation App key (see open items).

## Earlier

- 2026-07-07 p4: no-code GitHub sync UI built (`14b971b`,`07084e2`) — install button, repo
  dropdown, one-pick connect; manual entry behind "advanced"; tests + wiki updated.
- 2026-07-07 p3: full audit, every finding fixed with regression guards —
  [docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md).

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- VR/AR controller locomotion confirmed on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`
- Suite green: lint 0/0 · 423 tests · 29 contracts · 16 schema-sync (real equivalence) · 0 vulns

## What is broken / open

- Drive on prod: **verified live 2026-07-07** (user connected + browsed real Drive files on
  di-studio.xyz). Google console configured: scopes registered (drive.readonly restricted +
  userinfo), app runs In-production/unverified (warning screen + lifetime 100-connect cap —
  1-2 used). Full Google verification deliberately deferred; preferred long-term fix is
  migrating to the `drive.file` scope + Google Picker (no cap, no warning, no verification).
- Webhook-test artifacts await a keep-or-delete call: private repo `dob-0/di-sync-webhook-test`
  + prod space `webhook-test` (candidate permanent canary for the secret-rotation runbook).
- `serverXR/.env.local` holds a stale (pre-rotation) GitHub App key — local sync dev is broken
  until `GITHUB_APP_PRIVATE_KEY_B64` is copied from a host's `~/.config/dii/*.deploy.env`.
- If the `br_id_ge` repo is ever App-connected on prod, disable its `sync-space.yml` CI sync
  first — otherwise every push double-syncs the space.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work (per audit P4): op-log undo → content-addressed assets → self-host story.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
