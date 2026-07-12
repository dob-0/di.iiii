# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `2ccfdec8` — invite links (PR #44) + useAuthSession unmount-abort CI
fix. Deployed to staging, workflow smoke green + manual smoke 9/9.
Prod (`main`) = `533a3716` (scroll fix hotfixed; still lacks #38–#44).

## Last session (2026-07-12 — invite links, audit slice 6)

- Shipped self-serve sharing (PR #44 → dev → staging): owners mint 7-day invite
  links from the SpaceHub card; opening one grants that space to any session —
  registered (DB + cookie via `grantSpaceToSessionUser`) or guest (cookie-only).
- Server mirrors syncKeyStore: `space_invites` + `inviteStore.js`, owner-gated
  `POST/GET/DELETE /api/spaces/:id/invites`, fail-closed `POST /api/invites/redeem`;
  invitees can't mint invites (no escalation). Revoke is API-only (no UI, by choice).
- AuthGate auto-redeems `?invite=` when out of scope (wins over the public-view
  redirect), strips the param; expired links get a one-line note.
- Fixed a CI-only teardown race the deploy tripped: `useAuthSession` now aborts
  its session fetch on unmount (known-fixes entry + regression test).
- Tests: 3 inviteStore unit + 1 invite HTTP contract + 2 hook tests; wiki
  `invite-links` article + highlight; all validation green (577 unit / 47 contract).

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links (staging; prod after promotion)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## Open

- **Prod promotion checklist** (on user's word): merge dev→main + push, then
  repoint prod as done on staging 2026-07-10: DELETE the stray empty `open-jam`
  boot creates in `main`, PATCH `/api/config {"globalSpaceId": null}` (prod admin
  token = PROD_API_TOKEN in serverXR/.env.local). Prod API calls need approval.
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
