# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`47da80a` — on **staging** (smoke 9/9, 2026-07-08 afternoon). `main` is 4 commits behind; prod still at `07084e2`.

## Last session (2026-07-08 pm — public-route UX, shipped to staging)

- Spaces panel (editor): live badge + live URL, View Live / Copy Live Link, owner-only
  Make Public/Private; non-owned spaces show only View/Copy (`isPublic`/`isOwner` now
  survive the local/remote merge in `useSpacesController`).
- `/studio` hub cards: live link with one-click Copy; "Not yours" badge on public spaces
  you can't manage. Wiki publishing article updated.
- Tree held a parallel session's uncommitted work (op-log undo `useOpHistory`, GitHub
  sync + OAuth sign-in ported into the hub, guest-sandbox default, serverXR auth/route
  updates, drag-ghost fix); user chose to ship it combined in `47da80a` — suite was
  green on the whole tree (lint 0, 454 tests, build, wiki check).

## Earlier

- 2026-07-08 am: GitHub sync proven end-to-end (webhook auto-sync on prod), `dev`→`main`
  promoted; 2026-07-07: no-code GitHub sync UI + full audit fixed
  ([docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)).

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Public-route self-serve (live links, visibility toggles) in both Studio surfaces — staging
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Before promoting `dev`→`main`:** manually pass staging auth flows (guest sandbox entry,
  OAuth sign-in from the hub) — serverXR auth changes from the parallel session are unreviewed.
- `fix/native-drag-ghost` branch duplicates work now on `dev` — delete after confirming.
- Drive on prod verified live; full Google verification deferred (preferred fix: `drive.file`
  scope + Picker). Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` has a stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work: op-log undo **landed** (unverified in UI) → content-addressed assets → self-host.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
