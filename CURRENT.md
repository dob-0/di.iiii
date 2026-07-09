# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`8d59893b` — **live on staging** (content-addressed assets; smoke 9/9, /meta endpoint
verified live). `main` behind; prod still at `07084e2`.

## Latest session (2026-07-09 — CAS + live space-card previews)

- **Spaces hub live previews**: public+linked space cards embed the live route as a 16:9
  miniature (`?preview=1` viewer mode: static orbit cam, no chrome; IO-gated mount/unmount
  so off-screen cards cost nothing). SpaceHub WIP from the tree finished and shipped.

- Client pre-hash + upload dedupe (`/assets/:id/meta` probe); server verifies sha256 ids
  against content (400 on mismatch) — replace-under-immutable-cache hole closed.
- **Per-space blob store** (owner-approved): bytes live once in `spaces/<id>/blobs/<sha256>`,
  projects hold only `<hash>.json` refs; legacy binaries still served; deletes remove refs
  only; `scripts/gc-space-blobs.mjs` reclaims orphans (dry-run default). 37 contracts green.
- Earlier 2026-07-09: media/styles/formats/animation batch + keyframe timeline (12/12 E2E).
  Gotcha: restart serverXR after `projectSchema.cjs` changes — stale schema normalizes new
  entity types to boxes.

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
- Next strategic work: one-command self-host (portable space bundle: blobs+projects+meta).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
