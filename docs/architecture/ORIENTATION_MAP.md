# di.iiii — High-Level Orientation Map

> A single-page mental model of the repo: what it is, how the surfaces fit,
> where the important code lives, and where new work belongs. Read this to
> get oriented fast; follow the links for depth. For always-loaded routing,
> see [AGENTS.md](../../AGENTS.md); for current shipped state, see
> [CURRENT.md](../../CURRENT.md).

_Snapshot: analysis pass on branch `claude/project-analysis-fb8gcs`. Durable
structure only — dated status lives in `CURRENT.md` / `PROGRESS.md`._

---

## 1. What di.iiii is

A **browser-native platform for authoring and publishing spatial XR
experiences** — 3D scenes, node-driven behaviors, and AR/VR spaces — with no
native install and no engine lock-in. The editor runs in the browser; a
Node/Express backend (`serverXR`) owns persistence, auth, and publish state.
The public unit is a **space**; creators own their data.

- **Live:** [di-studio.xyz](https://di-studio.xyz) · **Repo:** `dob-0/di.iiii`
- **Stack:** React 18 + React-Three-Fiber / Three.js + MUI on the client;
  Express + SQLite + Socket.IO + SSE on the server; Vite build; Vitest tests.
- **Runtime baseline:** Node `22.x`, npm `10.x`.

---

## 2. The core data model

The whole system hangs off four concepts. Internalize these first.

| Concept | What it is |
| --- | --- |
| `space` | The public + management unit. Owns routes `/<space>`, `/<space>/studio`, `/<space>/beta`. |
| `project` | The editable document living inside a space. Stored independently from the public route. |
| `publishedProjectId` | The project currently shown on a space's public route. Publishing = pointing this at a project. |
| long-term doc shape | `rootNodeId`, `nodes[]`, `edges[]`, `assets[]`, `templates[]`, `workspaceState` — a recursive node graph. |

Direction of travel: **recursive node-first documents**. `worldState`,
`windowLayout`, and older entity structures are compatibility bridges, not the
canonical future. See [RECURSIVE_NODE_CORE.md](RECURSIVE_NODE_CORE.md).

---

## 3. Surfaces & lanes

Routing is path-segment based (`src/RootApp.jsx` dispatches on the URL
segments), not a flat router table.

| Surface | Route | Lane / role |
| --- | --- | --- |
| Public viewer | `/<space>` | Live published project (orbit / walk / XR). |
| **Studio** | `/<space>/studio` | **Stable main editor.** Five-window layout (World, View, Assets, Outliner, Inspector), now with a phone layout. This is where most product work happens. |
| Beta | `/<space>/beta` | Experimental node-first editor lane. Research / editor-v2. Not the shipped default. |
| WCC | `/wcc/...` | World Creative Commons surface — public showcase / artist-enter experience. |
| Admin / Ops | `/admin?space=<space>` | Space management + Ops Graph. |
| V1 | (compatibility) | Legacy fallback + migration-sensitive behavior. |

**Default for new work: `Studio`**, unless the task is explicitly experimental
(then `Beta`). Don't describe Beta as the shipped lane. Full surface breakdown:
[PROJECT_SURFACES.md](PROJECT_SURFACES.md).

---

## 4. Repo map — where code lives

~342 client JS/JSX files, ~57 server files, 121 test files. Key directories:

### Client (`src/`)
| Path | Role |
| --- | --- |
| `src/studio/` | Stable main editor lane (`StudioApp.jsx`, `components/`, `hooks/`). Main product work. |
| `src/beta/` | Experimental node-first lane (`BetaApp.jsx`, `BlankNodeWorkspaceApp.jsx`). |
| `src/project/` | **Shared document/collab logic center.** `nodeRegistry.js`, `entityRegistry.js`, state, sync, presence, viewport, import/transfer. New shared logic goes here. |
| `src/wcc/` | World Creative Commons public experience. |
| `src/shared/` | Client-side schema mirrors (`projectSchema.js`, `sceneSchema.js`). |
| `src/objectComponents/` | 3D object component implementations. |
| `src/xr/` | XR-specific rendering. |
| `src/wiki/` | In-app `/wiki` + landing help — **single source of truth for user-facing feature docs** (`wikiContent.js`). |
| `src/components/`, `src/hooks/` | Older orchestration surfaces — still active, but not the preferred home for new canonical logic. |
| `src/RootApp.jsx`, `src/App.jsx` | Top-level surface routing + shell. |

### Server (`serverXR/`) — the authority
`serverXR` is authoritative for **auth, persistence, assets, ops, SSE,
presence, and edit enforcement.** `serverXR/src/`:
- **Routes** (`routes/`): `authRoutes`, `projectRoutes`, `spaceRoutes`,
  `syncRoutes`, `userRoutes`, `configRoutes`, `integrationRoutes`,
  `openCallRoutes`, `statusRoutes` — mounted under `/serverXR/api` with
  read-role (`viewer`) and write-role (`editor`) middleware gating.
- **Stores** (`*Store.js`): `spaceStore`, `projectStore`, `userStore`,
  `commonsStore`, `openCallStore`, `driveTokenStore`, `spaceLinkStore`,
  `syncKeyStore`, `configStore` — filesystem/SQLite persistence.
- **Auth**: `authSession.js` (session cookies), `authAccess.js` (roles),
  `rateLimit.js`, `googleOAuth.js` / `googleDrive.js`, `githubApp.js`.
- **Realtime**: `socketHandlers.js`, `meshHub.js` (Socket.IO + SSE).

### Shared contracts (`shared/`, `src/shared/`)
Canonical cross-runtime schema: `projectSchema` + `sceneSchema` (`.cjs` for
Node/server, `.js` mirror for the client). Op-log / CRDT-compatible document
format lives here. Schema-sync test guards the mirror stays in lockstep.

### Automation (`scripts/`)
`dev-stack.mjs` (the `npm run dev` orchestrator), `deploy.mjs`, space
lifecycle (`space-new/pull/push/sync/bundle`), `self-host.mjs`, doc-sync
(`sync-agent-docs`, `check-wiki-sync`), smoke checks. Many are surfaced as
`npm run` scripts (see `package.json`).

---

## 5. Repo & deploy topology

```
Daily work ─▶ dob-0/di.iiii (primary public repo)
                 ├─ dev branch  ─▶ staging.di-studio.xyz
                 └─ main branch ─▶ di-studio.xyz (prod)
                        └─ cpanel-* release branches ─▶ cPanel hosting
```

- Branch flow: **`dev → main`**. Don't start routine work on `main` (hotfix
  only). Fork contributors work on task branches (`feat/`, `fix/`, `chore/`);
  pushing triggers `auto-pr.yml` → PR into upstream `dev`.
- Persistence is currently **single-host filesystem storage**; writes are
  protected by session/token auth (not yet a full multi-user identity/audit
  model). See [LIVE_DEPLOY.md](../deploy/LIVE_DEPLOY.md).

---

## 6. Where do I work? (routing cheat-sheet)

| If the task is about… | Go to | Role card |
| --- | --- | --- |
| CSS / layout / visual | `src/studio`, `src/beta` components | `ui-ux-engineer` |
| Node registry / ports / graph model | `src/project/nodeRegistry.js` | `node-system-engineer` |
| Three.js / viewport / XR render | `src/objectComponents`, `src/xr`, `src/project/viewport` | `viewport-3d-engineer` |
| Auth / SQLite / API / realtime | `serverXR/` | `backend-api-engineer` |
| Shared schema / op-log / CRDT | `shared/`, `src/shared/` | `schema-protocol-engineer` |
| Docker / Actions / deploy / scripts | `deploy/`, `.github/`, `scripts/` | `infrastructure-engineer` |
| Tests / lint / validation | anywhere `*.test.*` | `qa-test-engineer` |
| Auth review / secrets / access control | `serverXR/` | `security-auditor` |

Shared collaboration/document logic → `src/project/`. Prefer node-first
behavior over growing legacy object/window systems. Full role cards:
[docs/ai/roles/](../ai/roles/).

---

## 7. Validation

```bash
npm run lint                    # eslint src
npm run build                   # vite build
npm run test                    # vitest run (client + shared)
npm run test:server-contracts   # http / project / bundle contracts
npm run docs:ai:sync            # keep AGENTS/CLAUDE/GEMINI mirrors in sync
npm run docs:ai:check           # verify the mirrors are in sync
npm run docs:wiki:check         # verify user-facing wiki is in lockstep
node scripts/smoke-check.mjs --base-url <origin>
```

**Definition of done includes docs:** a user-facing change updates
`src/wiki/wikiContent.js`; a bug fix ships a `docs/ai/known-fixes.md` entry
plus a regression guard. Same tier as the code.

---

## 8. Reading order for a new agent

1. [AGENTS.md](../../AGENTS.md) — always-loaded router (auto-read).
2. [CURRENT.md](../../CURRENT.md) — what's shipped / broken right now.
3. Nearest scoped `AGENTS.md` (e.g. `src/studio/AGENTS.md`, `serverXR/src/AGENTS.md`).
4. Your role card in [docs/ai/roles/](../ai/roles/).
5. This map + [PROJECT_SURFACES.md](PROJECT_SURFACES.md) when you need the
   whole-system picture. Deep reference: [docs/ai/index.md](../ai/index.md).

---

## 9. Common misconceptions to avoid

- Beta is **not** the main shipped lane — Studio is.
- Physical/hardware sync is **direction**, not a productized capability today.
- Older orchestration files (`src/components/`, `src/hooks/`) are active but
  **not** the canonical home for new permanent logic — prefer `src/project/`.
- The public repo is a real dev repo, but **don't push** `.env` files, host
  secrets, or private ops material into it.
- `serverXR` — not the client — is the source of truth for auth, persistence,
  publish state, and realtime.
