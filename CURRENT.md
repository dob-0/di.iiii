# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4e080447` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-10 — install bundles; self-host merged + on staging)

- **Whole-install bundles** (this PR): `npm run install:export/install:import` — every
  space + admin instance config (`_server-config.json`) in one tar.gz of nested space
  bundles; `--spaces` subset, `--force` overwrite; `selfhost` auto-detects the format.
  Users never included. 42 contracts. Real-data round-trip verified (6 spaces, 98 MB).
- **Portable space bundles + one-command self-host** (PR #26, merged; staging smoke
  9/9 PASS): `npm run space:export/space:import` — offline tar.gz of a space; strips
  secrets, `--as` remaps URLs, GC-safe. `npm run selfhost -- <bundle>` = one command.
  Docs: `docs/deploy/SELF_HOST.md`.
- **WCC mouse-look on Wayland** (PR #27, on prod): pointer lock granted but zero deltas
  → watchdog falls back to drag-look; `?inputdebug=1` HUD. Awaiting user real-mouse
  confirmation on prod (Playwright can't reproduce — see known-fixes).
- Earlier, live on prod: onboarding §8 (PR #25); CAS blob store; live previews; timeline.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- Full Google Drive verification deferred (preferred: `drive.file` scope + Picker).
  Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
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
