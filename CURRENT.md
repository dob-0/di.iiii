# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`07084e2` — **live on prod** (`dev` == `main`, prod smoke 9/9, 2026-07-08 morning).

## Last session (2026-07-08 — GitHub sync proven end-to-end, promoted to prod)

Walked the new no-code connect flow live on staging (install → dropdown self-populates →
one-pick connect → initial sync, verified with `br_id_ge`). Promoted `dev`→`main`. On prod,
private test repo `dob-0/di-sync-webhook-test` connected to space `webhook-test`, then a
real `git push` (`17e88729f8`) hit `/api/github/webhook` and auto-synced the space with no
admin touch — **closes the long-open "webhook never exercised" item.**

## Session before (2026-07-07, part 4 — no-code GitHub sync UI)

`14b971b` + `07084e2`: admin GitHub-sync went no-code — install-app button (server resolves
app slug via App JWT), repo dropdown with quiet polling, one-pick connect with pre-selected
project; manual entry behind "advanced" (auto-shown when App env absent, e.g. self-host).
Contract + component tests added, wiki article rewritten.

## Earlier (2026-07-07, part 3 — full audit, everything fixed)

Tracker: **[docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)** — every High/Medium/Low
☑ with a regression guard (P0 UX, P1 security/rate-limiting, P2 camera-controls rewire, the
ESM↔CJS schema-drift catch, ~1,500 dead lines removed). Report artifact:
<https://claude.ai/code/artifact/210249cb-5815-4db6-8acb-b0edf5b0fd85>.

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
