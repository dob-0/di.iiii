# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4e080447` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-10 — self-host bundles merged; earlier: WCC mouse-look)

- **Portable space bundles + one-command self-host** (PR #26, merged to dev):
  `npm run space:export/space:import` — offline tar.gz of a space (DB rows, op-logs,
  scene, assets, CAS blobs); strips secrets, `--as` remaps URLs, GC-safe.
  `npm run selfhost -- <bundle>` = deps+env+import+run in one command. Round-trip
  contract-tested (40 contracts). Docs: `docs/deploy/SELF_HOST.md`.
- **WCC "walk works, mouse-look doesn't"** (PR #27, on prod): some Wayland setups GRANT
  pointer lock but deliver only zero `movementX/Y` — watchdog abandons the broken lock
  after 30 all-zero moves, drag-look takes over. `?inputdebug=1` shows a live input HUD.
  Awaiting user real-mouse confirmation on prod. Playwright CANNOT reproduce this
  (injected input bypasses the compositor) — see known-fixes. 17 input-check contracts.
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
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`). Next: portable *install*
  bundle (multi-space + config) and P2P/IPFS direction per MANIFESTO.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
