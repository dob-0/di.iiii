# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`024ef867` — dev = guest-journey rethink shipped (PRs #38–#41); staging deploying.
Prod (`main`) is at `13357b82` — promote after staging verify + user's word.

## Last session (2026-07-10 night — three-place space model)

Storyboard agreed (D1–D4), then built: one communal **Open Space** + one
**sandbox per identity** + your owned spaces. Artifact:
https://claude.ai/code/artifact/d0267562-fa6d-4fa7-9c2f-be3d4e094778

- **#38 server**: `open` space ensured at boot (kind global, public); communal +
  own-sandbox grants live in `canAccessSpace` (existing sessions covered, no
  cookie re-mint); admin `sandboxSummary` + `POST /api/admin/sandboxes/purge`;
  daily open-space snapshot + `POST /api/spaces/:id/restore-snapshot`.
- **#39 hub**: three shelves (Open Space / Your sandbox / Your spaces); admin
  sandbox flood collapses to one row with Sweep expired.
- **#40 entry**: landing primary CTA "Step inside" → `/open/studio` → forwards
  into boot-ensured `open-jam` project (`?browse=1` = hub list). Guest first-run
  = `StudioCoachMarks` action pills; help dialog no longer auto-opens.
- **#41 keep the room**: at sign-in the guest sandbox moves onto the account's
  sandbox (`promoteGuestSandbox`/`moveSpace`); `&kept=1` → toast. Never clobbers.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## Open

- Staging verify: `open` + `open-jam` exist post-deploy; check `globalSpaceId` in
  staging/prod config (set value repoints the commons; null → default `open`).
- Real-device click-through owed: this session + previous UX slices (now on prod).
- Old audit slice 6 (invite links) designed, not built. Drive Picker still blocked
  on Cloud console. Stale GitHub App key in `serverXR/.env.local`. Watch prod hangs.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
