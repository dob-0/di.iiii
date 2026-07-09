# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`8d59893b` — **live on staging** (content-addressed assets; smoke 9/9, /meta endpoint
verified live). `main` behind; prod still at `07084e2`.

## Latest session (2026-07-09 eve — content-addressed assets)

- Client pre-hash (`crypto.subtle`) + upload dedupe via new
  `GET /api/projects/:id/assets/:assetId/meta`; identical bytes skip the upload.
- Server now verifies sha256-shaped client `assetId`s against real content hash (400 on
  mismatch) — closed the replace-under-immutable-cache hole; streams hashing.
- Contract + unit tests, known-fixes row, wiki line. Full validation green (508 unit,
  36 contracts). Next CAS step: shared per-space blob store → one-command self-host.
- Earlier 2026-07-09: media/styles/formats/animation batch + `d4b3ce6` keyframe timeline
  (12/12 E2E). Local-dev gotcha: restart serverXR after `projectSchema.cjs` changes —
  stale schema in memory normalizes new entity types to boxes.

## Earlier

- 2026-07-08: 9 creation-process gaps shipped + E2E'd; GitHub sync proven `dev`→`main`;
  full audit ([docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)).

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Public-route self-serve (live links, visibility toggles) in both Studio surfaces — staging
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Before promoting `dev`→`main`:** one manual OAuth sign-in click-through on staging.
  Guest flow already verified programmatically (2026-07-08 eve): guest session/quota/OAuth
  providers correct; guests share `main` because staging admin config sets
  `globalSpaceId: "main"` (intentional open-jam mode — clear it in /admin for sandboxes).
- Uncommitted `SpaceHub.jsx` live-preview-iframe experiment in the working tree (another
  session's WIP, no CSS yet) — finish or discard before it goes stale.
- Drive on prod verified live; full Google verification deferred (preferred fix: `drive.file`
  scope + Picker). Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` has a stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work: per-space CAS blob store (in progress) → one-command self-host.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
