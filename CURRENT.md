# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`main` = `57b1ca6a` — **PROMOTED dev→main 2026-07-13, prod deploy green**: open
inscriptions, public CORS (inscriptions + scene reads), invite links (#44), WCC
walker fix (#46), sandbox popup escape + top-navigation, beta wire fix, TS-LSP
plugin. `dev` = same + digitalkar comment rename.

## Last session (2026-07-13 — prod promotion + br_id_ge go-live)

- Promoted dev→main (merge conflict in known-fixes.md resolved by union; branch
  protection bypassed as admin); Publish cPanel Release green; prod health 200.
- br_id_ge went communal on prod: space `br_id_ge` openInscriptions ON, published
  face = `landing` (admin PATCH — CI sync keys correctly cannot move the pointer),
  first inscription written via the public API.
- New serverXR since last promotion: `inscriptionRoutes.js` (anonymous append-only
  writes, opt-in per space, rate-limited) + PUBLIC_CORS_ROUTES entries for
  inscriptions/scene (block now drops Origin so cors() can't override '*').
- Preview iframes: `allow-popups-to-escape-sandbox` + `allow-top-navigation-by-
  user-activation` (white-tab class fixed); Beta graph wires painted for the first
  time (zero-area svg). All in known-fixes with guards.
- Prod config verified: `globalSpaceId` already null; no stray open-jam in `main`.

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
