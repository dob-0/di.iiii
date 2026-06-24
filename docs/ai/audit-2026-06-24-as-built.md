# Audit B — As Built (Empirical) · 2026-06-24

**"How it exact."** Derived only from the code, tests, build output, git, and live config.
The AI documentation (MANIFESTO, roadmaps, CURRENT.md, PROGRESS.md) was deliberately *ignored*
while producing this — it is the ground-truth half of the paired audit. Compare against
[audit-2026-06-24-as-documented.md](audit-2026-06-24-as-documented.md).

Caveat: the working tree at audit time carried a parallel agent's **uncommitted** edits in
`src/studio/Studio{Editor,QuickInsert,Shell}.jsx`, so the validation results reflect that tree,
not the pure committed state. No suite depends on those files in a way that changed outcomes.

## Scale (measured)

| Area | Files | Lines |
|---|---|---|
| `src/` | 295 | 47,869 |
| `serverXR/src/` | 28 | 5,697 |
| `src/shared/` | 5 | 1,972 |
| `shared/` | 3 | 1,505 |
| **app total** | ~331 | **~57k** |

- Tests: **86 files**, **334** unit/component + **21** server-contract + **13** schema-sync = **368 automated tests**.
- Dependencies: root 20 runtime / 17 dev; `serverXR` 9 runtime.

## Health — every gate green (run 2026-06-24)

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 6 a11y warnings (`SpaceHub.jsx`, `StudioHub.jsx`) |
| `npm run build` | pass — **0 circular-dependency warnings** |
| `npm run test` | **334 / 334** |
| `npm run test:server-contracts` | 21 / 21 |
| `npm run test:schema-sync` | 13 / 13 |
| `npm run check:three-vendor` | pass |
| `npm run docs:ai:check` | pass |

Bundle weights (gzip): `three-vendor` 1.31 MB → **369 KB**, `vendor` 451 KB → 149 KB,
`App` 222 KB → 57 KB. Three.js dominates payload; everything else is modest.

## Backend surface — `serverXR`, 44 HTTP endpoints

- **Auth:** session CRUD (`/api/auth/session`), GitHub + Google OAuth (`/auth/github`,
  `/auth/google` + callbacks), `/auth/providers`, admin users (`GET /api/users`,
  `PATCH /api/users/:userId`).
- **Spaces:** CRUD, `ops`, `assets` (POST/GET), `scene` (GET/PUT), `live`, `touch`, `events` (SSE).
- **Projects:** CRUD, `document` (GET/PUT), `ops`, `assets`, `events`.
- **Sync:** `pull` / `push` / `status` per space.
- **Platform:** `config` (GET/PATCH), `health`, `events`.
- Storage: SQLite (`node:sqlite`, experimental) + filesystem assets.
- **Asset IDs = SHA-256 of file content** (`crypto.createHash('sha256')` in
  `projectRoutes.js`/`spaceRoutes.js`; `projectStore.js` enforces SHA-256 hex). Op/guest/user
  IDs remain `randomUUID` (correct — those aren't content-addressable).

## Frontend surface

- Routes: `/` (landing), `/studio` (`main`-space alias), `/:spaceId` (space → viewer or studio),
  `/beta`, `/wcc`.
- Three lanes: **Studio** (`src/studio`, main), **Beta** (`src/beta`, node-graph),
  **shared** project logic (`src/project`).
- Shared viewport leaf renderer **is extracted**: `src/project/viewport/EntityContent.jsx`
  + `buildAssetMap.js` (+ test), consumed by both Studio and Beta viewports.
- Entity types rendered (14): `box · sphere · cone · cylinder · text · image · video · audio ·
  model · pointLight · spotLight · directionalLight · ambientLight · portal`.

## Refactor pressure — files > 750 LOC

`BetaEditor.jsx` 1114 · `nodeRegistry.js` 1098 · `WccExhibition.jsx` 1073 ·
`StudioShellPanels.jsx` 988 · `LiveProjectScene.jsx` 969 · `StudioViewport.jsx` 911 ·
`StudioEditor.jsx` 906 · `projectSchema.js` 848 · `serverXR/index.js` 799 ·
`useAppState.js` 770 · `wcc/landing/LandingPage.jsx` 761.

## Git / deploy reality

- **Production** (`main`, di-studio.xyz) = `3d9bf89`. **3 commits behind** `dev` — does **not**
  include the Portal Object feature or the landing CTA work.
- **Staging** (`dev`) = `09f5e05`, 3 ahead → portal object + landing buttons live on staging only.
  Prebuilt branch `cpanel-staging` = `da5e9af`.
- **5 parked branches** (last touched 2026-06-18 … 06-20): `chore/fork-sync-contract`,
  `feat/asset-optimization-and-agent-efficiency`, `feat/studio-workflows`,
  `feature/landing-pages`, `self-host` — plus several `.claude/worktrees/*`.
- `dist/` is gitignored (build output not committed — correct). Two gitignored leftover probe
  scripts sit in repo root (`shot-insp*.cjs`).

## Empirical conclusion

The codebase is **healthy and shippable**: all seven gates green, no circular deps, ~368
automated tests, clean trust boundary (writes owned by `serverXR`; no secrets on the bundle
path observed). The real, measurable debt is **file concentration** (11 files > 750 LOC,
several being multi-concern orchestrators), **5 stale branches**, **2 test suites outside CI**
(`server-contracts`, `schema-sync` — both currently passing), and **production lagging staging
by 3 commits**.
