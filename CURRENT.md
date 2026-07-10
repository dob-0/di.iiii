# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4e080447` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-10 — guest sandbox fix; Drive drive.file+Picker)

- **Guest sandbox cleanup** (this PR): sandboxes lazy-provision on first entry (page
  views mint nothing), hidden from everyone else's `GET /api/spaces` (admin incl.;
  guest's own card synthesized until provisioned), idle ones reaped after 7 days
  (`SANDBOX_TTL_MS`). Fixes admin directory flooded with "Guest Sandbox" rows.
- **Drive scope migration** (staging): `drive.readonly` → **`drive.file`** + Picker,
  "Pick from Drive" buttons, `/picker-token`, `GOOGLE_APP_ID`. Needs Cloud console
  setup + real-account click-through — `docs/ops/GOOGLE_DRIVE_INTEGRATION.md`.
- **Whole-install bundles** (PR #28) + **space bundles/self-host** (PR #26) on staging;
  real-data round-trip verified (6 spaces, 98 MB); `selfhost` auto-detects bundle type.
- **WCC mouse-look on Wayland** (PR #27, prod): awaiting user real-mouse confirmation.

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
