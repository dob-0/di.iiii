# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: feat/invite-links

---

## Last commit

`dev` = `6b181746` (guest-journey rethink #38–#41, sandbox archive/revive #42,
SpaceHub scroll fix). Prod (`main`) = `533a3716` (scroll fix hotfixed; still
lacks #38–#42). Staging commons repointed to `open` (verified, smoke 9/9).

## Last session (2026-07-12 — invite links, audit slice 6)

Self-serve sharing built on `feat/invite-links` (uncommitted → see git status):
- `inviteStore.js` + `space_invites` table (mirror of syncKeyStore):
  `dii_invite_<id>.<secret>`, 7-day TTL, fail-closed, use_count on redeem only.
- `POST/GET/DELETE /api/spaces/:id/invites` (owner-or-admin, rate-limited);
  `POST /api/invites/redeem` grants scope: registered → `grantSpaceToSessionUser`
  (DB + cookie), guest/token sessions → cookie-only re-mint. No escalation:
  invitees can't mint invites.
- SpaceHub owner card: Invite button → copies `/<space>/studio?invite=<token>`.
- AuthGate: auto-redeems `?invite=` when out of scope, refreshes session,
  strips param; invite wins over public-view redirect; failure = one-line note.
- Tests: inviteStore.test.js (3) + httpContracts invite contract (1). Wiki
  `invite-links` article + highlight. All validation green (575 unit / 47 contract).

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links (this branch, not yet merged to dev/staging)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## Open

- **feat/invite-links**: commit + PR to dev + staging smoke, on user's word.
- **Prod promotion checklist** (on user's word): merge dev→main + push, then
  repoint prod as done on staging 2026-07-10: DELETE the stray empty `open-jam`
  boot creates in `main`, PATCH `/api/config {"globalSpaceId": null}` (prod admin
  token = PROD_API_TOKEN in serverXR/.env.local). Prod API calls need approval.
- Real-device click-through owed: staging (guest journey + invites once merged)
  + previous UX slices (on prod). Old guest cookies keep `main` in scope ≤30d.
- Drive Picker blocked on Cloud console. Stale GitHub App key in
  `serverXR/.env.local`. Watch prod hangs.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
