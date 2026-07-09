# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4e080447` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-09 night — WCC mouse-look fix, deployed to prod)

- **WCC "walk works, mouse-look doesn't"** (PR #27): some Wayland setups GRANT pointer
  lock but deliver only zero `movementX/Y` — watchdog abandons the broken lock after 30
  all-zero moves, drag-look takes over. `?inputdebug=1` shows a live input HUD.
  Awaiting user real-mouse confirmation on prod. Playwright CANNOT reproduce this
  (injected input bypasses the compositor) — see known-fixes. 17 input-check contracts.
- **PR #26 (draft, open)**: one-command self-host — `npm run selfhost -- <bundle>`,
  space export/import CLI (`space:export`/`space:import`), round-trip contract tests.
- Earlier 2026-07-09, live on prod: onboarding §8 + golden rule (PR #25); CAS blob
  store; Spaces-hub live previews; media/animation timeline.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- Full Google Drive verification deferred (preferred: `drive.file` scope + Picker).
  Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`). Self-host feature itself
  is built and waiting in draft PR #26 (merge decision pending).

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
