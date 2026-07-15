# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `43b5c387` — homepage features br_id_ge + beyond_form buttons next to
WCC Exhibition (own accent colors); br_id_ge Studio project switcher now
follows an explicit hierarchy (landing → rite → constellation → field →
drafts → legacy) instead of most-recently-touched order. `main` = `a70da5d9`
— prod green: admin delete for open-call applications, direct project links,
open inscriptions, public CORS, invite links (#44), WCC walker fix (#46).

## Last session (2026-07-15 — di.i brand toolkit + open_space 3D fix)

- Built the full di.i brand-guide/export toolkit (scratchpad, not repo):
  logo/social/web assets, in-page + full-zip download, v1 (canonical,
  nested-square mark/black-cyan/Inter) kept live after user rejected a
  built-out "weave" v2 alternative as the new default — v2 archived intact
  inside the `brand-directions` Studio project instead of deleted.
  Fixed the deck wordmark's dot: square tittles/period (dotless-i +
  drawn square span), matching the deck's actual glyph, not the font's
  round default. Pushed live to `brand-guide` (Studio project, v10).
- Fixed the live homepage `main-dii-project` ("open_space") 3D scene: was
  rendering wrong (blue `#0000a0` bg, red-tinted/off-brand-blue shapes,
  miscolored lights) — corrected all to brand tokens, moved 3 stranded
  light/box entities into the actual gallery footprint, set a real
  `worldState.spawn` near the two sculpture models facing the authored
  77-image path.
- Root-caused a separate **local-dev-only** bug found while verifying the
  scene: `vite.config.js` proxied `/serverXR/*` but not bare `/api/*`. In
  prod both are one origin so this never showed; in dev it silently
  served asset requests Vite's HTML fallback instead of real bytes. Fixed
  with a `/api` proxy + rewrite (uncommitted, see Open).
- Added a golden rule: never push generated/code-mode HTML to a Studio
  project without rendering it in a real headless browser first — root
  cause of two silent blank-page pushes this session (`</style>`-deletion
  bug swallowing the whole doc as CSS, zero console errors).
- Also (2026-07-14) — br_id_ge homepage/hierarchy: `ProjectSwitcher.jsx`
  client-side `SPACE_PROJECT_ORDER` sort; `LandingPage.jsx`/`landing.css`
  `FEATURED_SPACES` row (br_id_ge cyan, beyond_form black/white). Pushed
  to `dev` (`43b5c387`). Studio content cross-nav links added to
  `br-id-ge-graph`/`br-id-ge-field` (local/staging/prod; `br-id-ge-hosq`
  untouched). Not yet visually click-through verified.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links + open inscriptions + public CORS; deploy: `dev`→staging, `main`→prod
- Staging auto-deploy cron (2-min poll) healthy as of last deep-audit session

## Open

- Uncommitted in working tree: `vite.config.js` (dev `/api` proxy fix),
  `docs/ai/golden_rules.md` (render-before-push rule) — real, verified
  fixes, just not committed yet (commit only on request).
- Brand: canonical domain/handle still undecided (di-studio.xyz vs
  thedi.studio vs the IG handle) — left open in the brand guide itself.
  `/privacy` exists only as a standalone Studio page, not wired into the
  live React app's routes yet.
- Manual click-through owed on this session's changes: homepage buttons,
  br_id_ge dropdown order, constellation/field cross-nav links.
- VPS migration decision pending (Hetzner CPX21 + Docker scoped, untested —
  see PROGRESS.md); keep cPanel as fallback until VPS exists.
- ANSCC research-grant angle for `br_id_ge` — user wants ~1 month before
  writing an actual research case, if pursued at all.
- Real-device click-through owed: staging (guest journey + invite flow) +
  previous UX slices (on prod). Old guest cookies keep `main` in scope ≤30d.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
