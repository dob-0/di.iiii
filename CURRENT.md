# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = open inscriptions (append-only portal writes, for br_id_ge vi.ritual);
before that `2ccfdec8` — invite links (PR #44), deployed to staging, smoke green.
Prod (`main`) = `533a3716` (scroll fix hotfixed; still lacks #38–#44).

## Last session (2026-07-12 — open inscriptions / vi.ritual)

- **Open inscriptions**: a public space can opt in (`PATCH {"openInscriptions":true}`,
  new spaces column via ensureColumn) to anonymous, append-only writes:
  `POST /api/spaces/:id/inscriptions {name, word}` — registered BEFORE the /api
  auth gates (like open-call submissions), rate-limited (12/10min), server builds
  the single sanitized `text-2d` object (`insc-…`, golden-spiral placement) itself;
  update/delete impossible on this path, generic ops route stays gated
  (`serverXR/src/routes/inscriptionRoutes.js`). Kill switch: `allowEdits:false`.
- Built for br_id_ge's **vi.ritual**: finishing the rite writes the inscription
  into the di.iiii space `vi-ritual` (client wiring in br_id_ge `index.html`,
  gated by `<meta name="field-url">`, live locally; prod pending space creation).
- Tests: 1 HTTP contract (opt-in gate, sanitize, append-only, kill switch) —
  48/48 contracts green. Wiki `open-inscriptions` article added.

## Previous session (2026-07-12 — invite links, audit slice 6)

- Invite links (PR #44 → dev → staging): owner-minted 7-day links, AuthGate
  auto-redeems `?invite=`; details in git history + wiki `invite-links`.

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
