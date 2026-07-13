# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`main` = `dev` = `5abf8351` — **PROMOTED dev→main 2026-07-13 (second), prod
green**: direct project links `/:space/p/:projectId` in the public viewer
(share any project of a public space without moving the published pointer;
tests + wiki entry included). Earlier same day: open inscriptions, public
CORS, invite links (#44), WCC walker fix (#46), sandbox popup escape.

## Last session (2026-07-13 afternoon — /p/ links + open-call backup)

- Found the `/p/:projectId` feature complete but uncommitted in the working
  tree; full validation green (lint, 581 fe tests, build, 48 contracts, wiki
  check) → committed `5abf8351`, pushed dev→staging, promoted dev→main.
  Publish cPanel Release green; prod smoke 8/8; `/br_id_ge/p/landing` 200.
- Open-call backup before touching prod: `beyond-form` space + 13 applications
  (3 new since Jul 10) pulled into private `dob-0/di-spaces` (`ef9286e`);
  `sync-all.sh` now includes beyond-form + an applications dump step.
- br_id_ge communal on prod since morning session: openInscriptions ON,
  published face `landing`, `inscriptionRoutes.js` + PUBLIC_CORS_ROUTES live.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links + open inscriptions + public CORS (LIVE on prod since 2026-07-13)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## Open

- Real-device click-through owed: staging (guest journey + invite flow) +
  previous UX slices (on prod). Old guest cookies keep `main` in scope ≤30d.
- Drive Picker blocked on Cloud console. Stale GitHub App key in
  `serverXR/.env.local`. Watch prod hangs.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
