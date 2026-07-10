# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4e080447` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-10 — Drive drive.file+Picker; install bundles on staging)

- **Drive scope migration** (this PR): `drive.readonly` → **`drive.file`** (non-sensitive,
  no Google verification) + Google Picker. New "Pick from Drive" button (both surfaces),
  `/picker-token` endpoint, `GOOGLE_APP_ID` env. Needs Cloud console: enable Picker API,
  add drive.file scope, set GOOGLE_APP_ID — see `docs/ops/GOOGLE_DRIVE_INTEGRATION.md`.
  NOT runtime-tested (needs real Google account on staging).
- **Whole-install bundles** (PR #28, on staging, smoke 9/9): `npm run
  install:export/install:import` — every space + instance config in one tar.gz;
  `selfhost` auto-detects. Real-data round-trip verified (6 spaces, 98 MB).
- **Space bundles + self-host** (PR #26, staging): `space:export/import`, `selfhost`.
- **WCC mouse-look on Wayland** (PR #27, on prod): zero-delta pointer lock → drag-look
  fallback; `?inputdebug=1` HUD. Awaiting user real-mouse confirmation on prod.
- Earlier, on prod: onboarding §8 (PR #25); CAS blob store; live previews; timeline.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- Drive `drive.file`+Picker shipped in code; blocked on Cloud console setup + a real-account
  click-through. Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`). Next: P2P/IPFS per MANIFESTO.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
