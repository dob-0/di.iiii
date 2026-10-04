# Organisation audit, slice A: the product code (2026-10-05)

**What this is.** A read-only map of where the product code of di.iiii lives today, what sits in the
wrong place, what exists twice, and one target layout as a move list. Nothing was moved. The owner
asked on 2026-10-05: *"we need to manage and organize our tools, it's so messy — audit the whole
di.iiii and let's re-manage everything in the right place."*

**Scope.** `src/`, `serverXR/`, `shared/`, `sdk/`, `public/`, `spaces/`, `legacy/`, `android-twa/`
and the addresses a person opens. Scripts and tools (slice B), branches, PRs, worktrees and docs
(slice C) and MOXIR itself (slice D) are covered elsewhere.

**Base.** `origin/dev` at `07b6b30b` (2026-10-05). Words follow `docs/ai/vocabulary.md`: space,
project, scene, object, place, production, work.

**Method, so it can be re-run.** No build, test, lint, server or browser was run (aylmo fan fault).
- Sizes: `git ls-files <dir> | wc -l` for files; `wc -l` over `.js/.jsx/.mjs/.cjs/.ts/.css/.html/.py` for
  lines (**tests included** unless a row says otherwise). Dates: `git log -1 --format=%cs -- <path>`.
- Reachability: a static import walk from the one browser entry, `src/index.html` → `src/index.jsx`.
  It follows `import`, `export … from`, `import()`, `require()`, `new URL(…, import.meta.url)` and
  `import.meta.glob`. A file it never reaches is "unreached". It then checks every unreached file
  against `vite.config.js`, `scripts/`, `serverXR/` and the tests by name. The script is not committed:
  it is a 30-line walker and this report quotes what it found. The same walker with one file blocked
  measures "code only that file pulls in". Limits: it does not see string-built import paths or JSON
  imports. Every claim below that uses it was checked again by hand (`git grep`).
- **CONFIRMED** = seen in the code at the cited path and line. **SUSPECTED** = what the evidence points
  to, not yet proven. Treat both as findings, not facts, until someone acts on them
  (`feedback_audit_findings_are_hypotheses`).

Reused, not redone: `docs/ai/vocabulary.md`, `docs/architecture/PROJECT_SURFACES.md`,
`docs/ai/audit-2026-07-17.md`, `docs/architecture/PROJECT_AUDIT_2026-04-17.md` (which named V1 as
"compatibility and fallback only", line 250, six months ago), `src/works/boundary.test.js`, and the
capability map at `https://local.thedi.studio/lab/p/what-di-iiii-can-do` (1,113 entries, 09-23; not
re-fetched here).

---

## The short version

1. **The old editor (V1) is still live and spread through the generic folders.** 106 files, 18,611
   lines are reached *only* through `src/App.jsx`: 52 of the 72 files in `src/hooks/`, 24 of 64 in
   `src/components/`, 7 of 15 in `src/services/`, 11 panel files loose at the top of `src/`. It still
   draws every space that has no published project, and **the admin console (`/{space}/admin`) lives
   inside it**. CONFIRMED.
2. **The same thing is kept twice by hand.** The 2,717-line project schema has a hand-kept copy
   for the server (`shared/projectSchema.cjs` line 1: *"Manual CJS mirror … Keep this in lockstep by
   hand"*). The reason it gives no longer holds: the original imports only two pure files. There are
   **three renderers for one project document** (`LiveProjectScene` 2,172 lines, `StudioViewport` 1,324,
   `RawViewport` 1,511), and a test exists only because the copies drifted apart twice. There are
   **two lighting-desk clients**. CONFIRMED.
3. **One show is built into the platform.** MOXIR's rental inventory (≈300 KB of JSON),
   its fixture library (`src/rigbuild/types/moxir.json`, the only library) and 31 photos and renders in
   `public/rigbuild/` go into the bundle of every install. The data is tied to the space name
   (`src/rigbuild/items/media.json:5` `"space": "moxir"`). This breaks the vocabulary's own rule that a
   production *"uses di.iiii; it does not live in it."* CONFIRMED.

What is already in good order (measured, not assumed): only **30 of 859** non-test files in `src/` are
unreached. The works boundary (`src/works/`) is enforced by a test. MOXIR appears in platform code
almost only in **comments** that cite it as the test case. No platform logic branches on `moxir`.

---

## 1. The map

### 1a. Top-level areas

| Area | Files | Lines | Last touched | What it is |
| --- | ---: | ---: | --- | --- |
| `src/` | 1,449 | 248,109 | 2026-10-04 | The browser app: every surface a person opens |
| `serverXR/` | 322 | 80,567 | 2026-10-05 | The server: auth, storage, publish state, realtime, the lighting desk, NDI, the rig protocol |
| `spaces/` | 171 | 38,168 | 2026-09-30 | Space declarations + content snapshots; `spaces/network` alone is 145 files (54 people's pages) |
| `public/` | 182 | 26,208 | 2026-09-28 | Static files: vendor libs (4.1 MB), `wcc` media (25 MB), rig photos (2 MB), suite, kit stills, cPanel PHP shims |
| `shared/` | 8 | 3,800 | 2026-10-04 | CommonJS copies of client modules for the server and scripts |
| `sdk/` | 16 | 2,179 | 2026-09-24 | The agent door (MCP) client: `door.js`, `mcp.mjs`, `moves.js` |
| `android-twa/` | 1 | 44 | 2026-09-11 | One manifest: the `/chat` phone app wrapper (`xyz.distudio.chat`) |
| `legacy/` | 3 | 0 code | 2026-04-09 | cPanel git-pull and PM2 build scripts |

### 1b. Inside `src/` (files incl. tests / lines incl. tests / last touched)

| Folder | Files | Lines | Last | Role |
| --- | ---: | ---: | --- | --- |
| `src/raw/` | 185 | 39,855 | 10-04 | Nodes (the node canvas) + `raw/director/` (3,531 lines, see §2) |
| `src/project/` | 245 | 34,368 | 10-04 | The shared project document, ops, viewer, `viewport/` (render pieces, Smart View) |
| `src/studio/` | 123 | 23,910 | 10-04 | Studio, the main editor |
| `src/rigbuild/` | 173 | 23,112 | 10-04 | Rig tools: plot, cards, scenes, equipment, build, crew, patch sheet, visualiser |
| `src/algoVrithm/` | 116 | 19,347 | 09-09 | A work (artwork), grandfathered |
| `src/components/` | 110 | 17,009 | 10-04 | "Generic" UI, really four things mixed (see §2) |
| `src/hooks/` | 98 | 14,610 | 10-02 | 52 of 72 source files belong to V1 only |
| `src/map/` | 43 | 7,571 | 10-01 | Projection (the mapper) + **the lighting-desk client** (see §3) |
| `src/utils/` | 53 | 5,307 | 10-01 | Routing, framing, helpers |
| `src/styles/` | 23 | 5,152 | 10-04 | CSS |
| `src/shared/` | 15 | 4,896 | 10-04 | Project/scene schema, placement, production versions (ESM originals) |
| `src/objectComponents/` | 36 | 4,576 | 10-02 | Object renderers (spot beam, haze …) |
| `src/landing/` | 15 | 3,546 | 10-01 | `/` front door + `LocalHome` |
| `src/scan/` | 17 | 3,516 | 09-22 | `/{space}/scan` |
| `src/timeline/` | 17 | 3,445 | 09-24 | Clock, light vocabulary, edit list |
| `src/wccSite/` | 19 | 3,208 | 09-16 | A work (artwork), grandfathered |
| `src/chat/` | 14 | 2,945 | 09-11 | `/chat`, `/{space}/chat`, private chat |
| `src/make/` | 13 | 2,846 | 09-28 | `/{space}/make/{project}` (the toybox) |
| `src/wiki/` | 4 | 2,411 | 10-04 | `/wiki`; `wikiContent.js` alone is 1,960 lines of text |
| `src/services/` | 23 | 2,289 | 09-28 | API clients; 7 of 15 are V1-only |
| `src/perform/` | 12 | 2,249 | 09-24 | `/{space}/perform/{project}` |
| `src/kit/` | 11 | 1,853 | 09-30 | `/tools` |
| `src/rigMirror/` | 10 | 1,530 | 09-29 | The desk's live state read back into the scene |
| `src/pages/` | 10 | 1,260 | 09-29 | `/{space}/projects`, `/privacy`, `/terms`, `/for-apps` |
| `src/works/` | 9 | 802 | 09-28 | The works registry and boundary |
| `src/storage/` | 4 | 460 | 10-01 | Local persistence |
| `src/rig/` | 6 | 435 | 09-24 | Client of the **rig protocol** (machines on a network), not the lighting rig |
| `src/xr/` | 5 | 305 | 08-31 | XR helpers (2 of them V1-only) |
| `src/state/`, `src/contexts/` | 3 | 164 | 06-19 / 04-01 | V1's scene store and contexts |
| `src/*` loose files | 37 | 7,380 | 04-01 → 10-02 | `RootApp`, `SpaceSurfaceApp`, `App` + 11 V1 panels + tests at the root |

### 1c. Inside `serverXR/src/`

| Folder | Files | Lines | Last | Role |
| --- | ---: | ---: | --- | --- |
| *(root, flat)* | 79 source + tests | 14,297 source | 10-05 | `index.js` (2,874 lines), `socketHandlers.js` (1,042), `spaceStore.js` (995), ~30 `*Store.js`, auth, AI, mail, mesh |
| `lighting/` | 34 | 20,904 | 10-02 | The lighting desk, **including its own vanilla-JS UI** (`ui/app.js` 6,224 lines) served at `/light/` |
| `routes/` | 46 | 11,209 | 10-04 | 26 route modules (`spaceRoutes.js` 1,854, `projectRoutes.js` 1,231) |
| `rig/` | 38 | 4,472 | 10-01 | Rig protocol 1: LAN discovery, members, sinks, blackout |
| `follow/` | 16 | 3,691 | 10-05 | `di follow`: one install follows a space on another |
| `ndi/` | 18 | 3,358 | 09-24 | NDI in/out (`/ndi`) |
| `catalogue/` | 15 | 1,950 | 09-29 | `/api/catalogue` (the agent door's list) |
| `machines/` | 6 | 1,460 | 09-28 | Cross-machine signalling over a follow |
| `liveAi/` | 2 | 238 | 09-28 | Live AI relay |

### 1d. The surfaces: address → code → server

All dispatch happens in one 920-line `if` chain, `src/RootApp.jsx:388-912`. Each tool has its own
address parser: there are **17 `*Routing.js` files**. Sizes are folder totals from 1b.

| Address a person opens | Code | Server it talks to | Gate |
| --- | --- | --- | --- |
| `/` | `src/landing/LandingPage.jsx`; on a local install `LocalHome.jsx` | `/api/spaces/main…` | public |
| `/?room=1`, `/{space}` (published project) | `SpaceSurfaceApp.jsx` → `src/project/components/PublicProjectViewer.jsx` → `LiveProjectScene` (walk) or `StudioViewport` (orbit) | `/api/spaces/:id` (polled every 2 s, `SpaceSurfaceApp.jsx:13`), `/api/projects/:id/document`, `/events` | per space `isPublic` |
| `/{space}` (no published project) | `SpaceSurfaceApp.jsx:162` → **V1** `src/App.jsx` | `/api/spaces/:id/scene`, `/ops`, `/events`, Socket.IO | per space |
| `/{space}/admin` | **V1** `App.jsx` → `components/PreferencesPage.jsx` + `components/preferences/*` | `/api/users`, open calls, visitors, estate, agents, GitHub | gated |
| `/{space}/p/{id}`, `/{space}/{slug}` | `RootApp.jsx` `SlugProjectRoute` → same viewer | `/api/resolve/:space/:project` (inline in `index.js:1967`) | per space |
| `/{space}/studio…` | `src/studio/StudioApp.jsx` | `/api/spaces`, `/api/projects/*` (ops, document, assets) | gated |
| `/{space}/raw/…` (Nodes) | `src/raw/RawApp.jsx` | `/api/projects/*`, `/light/api` via `raw/utils/dmxRigClient.js` | gated; `/out` public on public spaces |
| `/open_jam`, `/open_jam/scene` | `src/project/components/JamSurface.jsx` → `LiveProjectScene` | projects API | gated (guest) |
| `/{space}/make/{id}` | `src/make/MakeSurface.jsx` → `RawViewport` | projects API | gated |
| `/{space}/map/{id}[/out]` (Projection) | `src/map/MapSurface.jsx`, `MapOutput.jsx` | projects API, `/light/api`, `/ndi` | gated |
| `/{space}/perform/{id}` | `src/perform/PerformApp.jsx` | projects API, `/light/api` | gated |
| `/{space}/patch\|plot\|cards\|scenes\|equipment\|build\|crew\|visualise/{id}` | `src/rigbuild/*Surface.jsx` (8 routing files) | projects API, `/light/api/*` | `RigToolRoute`: members edit, public reads |
| `/{space}/touch/{id}` | forwards to `/light/#touch` | — | — |
| `/{space}/scan` | `src/scan/ScanSurface.jsx` | `/api/spaces/:id/place/build` (`routes/placeRoutes.js`) | gated |
| `/{space}/projects` | `src/pages/SpaceContentsPage.jsx` | `/api/spaces/:id/contents` | per space |
| `/chat`, `/{space}/chat` | `src/chat/*` | Socket.IO, `/api/chat/rooms`, DM routes | gated |
| `/tools`, `/wiki`, `/privacy`, `/terms`, `/for-apps`, `/login` | `src/kit/`, `src/wiki/`, `src/pages/`, `components/AuthGate.jsx` | little or none | public |
| `/wcc`, `/algovrithm` (+`/scene`) | `src/works/routes.jsx` → `src/wccSite/`, `src/algoVrithm/` | space flag only | per space |
| `/light/` | **served by the server**, not React: `serverXR/src/lighting/ui/` | `/light/api/*` (`lighting/desk.js`) | local install only |
| `/ndi` | `serverXR/src/ndi/` | — | local only |
| `/suite`, published pages | `public/suite/`, space pages from `spaces/*` | asset routes | public |

---

## 2. Wrong place

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| W1 | **V1, the old editor, is spread through the generic folders** and still renders two live things: any space without a published project, and the admin console. | `src/SpaceSurfaceApp.jsx:158-162` (`<App />` for `APP_PAGE_PREFERENCES` and as the last fallback). Blocking `src/App.jsx` in the walk drops 106 files / 18,611 lines: 52 in `src/hooks`, 24 in `src/components`, 7 in `src/services`, 4 in `src/utils`, the 11 root panels (`AssetPanel`, `InspectorPanel`, `Menu`, `MediaPanel`, `MultiSelectionControls`, `OutlinerPanel`, `SelectableObject`, `SpacesPanel`, `ViewPanel`, `WorldPanel`, `Experience`), plus `src/state/`, `src/contexts/`, `src/shared/sceneSchema.js` and 2 of `src/xr/`. Most of the root panels were last touched 2026-04-08. | CONFIRMED |
| W2 | **The admin console is mounted inside V1's whole editor state.** Opening `/{space}/admin` builds V1's scene store, sync, XR and spaces contexts first. `usersApi`, `openCallApi`, `appVisitorsApi` and `statsApi` are reachable *only* this way. | `src/App.jsx` (`useAppState()` → `AppSurfaceSwitch isPreferencesPage`); walker: those 4 services are in the V1-only set | CONFIRMED |
| W3 | **The platform's lighting-desk client lives in the Projection tool's folder.** `lightingApiUrl` / `probeLightingDesk` are defined in `src/map/lightingLink.js:33,42`. 17 files in `rigbuild/`, `rigMirror/`, `perform/`, `studio/` and `map/` import it from there. | walker importers of `src/map/lightingLink.js` | CONFIRMED |
| W4 | **One show's data is in the platform bundle.** The only fixture library is `src/rigbuild/types/index.js:3` `import moxir from './moxir.json'`. The rental inventory `src/rigbuild/items/*.json` (lights 57 KB, effects 37 KB, media 104 KB, control, renders) is imported by `Inventory.jsx:2-3` and `useEquipment.js:7`. The asset store is fixed to `"space": "moxir"` (`items/media.json:5`). 31 files sit in `public/rigbuild/items/` (2 MB). The code around it is generic. Only the data and its name are one show. | paths cited | CONFIRMED |
| W5 | **A work's tool sits inside Nodes.** `src/raw/director/` (3,531 lines) is algoVrithm's director. It saves by POSTing to `/__algovrithm/edit-list` (`DirectorPanel.jsx:401`), which writes `src/algoVrithm/sequences/index.js` (`DirectorPanel.jsx:1088`). `editListSource.js` is used only by `vite.config.js` and an algoVrithm test. `timeline/timingOverlay.js:93` keys its settings `'algovrithm'`, and `raw/director/splitLayout.js:22` stores `di.studio.algoVrithmSplit`. `boundary.test.js:6-24` records that 1,650 lines already went this way once. | paths cited | CONFIRMED |
| W6 | **Node-only libraries live in the browser folder.** `src/rigbuild/gdtf.js`, `mvr.js`, `patchPlan.js` and `deskLookValues.js` are never reached from the app. Their only callers are `scripts/rigbuild/export-mvr.mjs`, `patch-plan.mjs`, `patch-sheet.mjs` and `show-loop.mjs`. | walker + `git grep` | CONFIRMED |
| W7 | **The project renderer the public sees lives in "generic" components.** `src/components/LiveProjectScene.jsx` (2,172 lines) is the viewer's walk renderer, together with `portalWalkThrough.js`, `walkModeConfig.js`, `walkableAreas.js`, `arrivalFraming.js`, `xrFlyControl.js` and `entryTransition/` (≈1,000 lines). It is imported by `project/components/PublicProjectSceneSurface.jsx`, `JamSurface.jsx`, `rigbuild/BuildSurface.jsx`, `wccSite/WccExperience.jsx` and `components/GridFloorBackground.jsx`. `src/components/` mixes four things: V1 editor chrome, account/auth, admin pages and this renderer. | walker importers | CONFIRMED |
| W8 | **The server's front file is half split.** `serverXR/src/index.js` is 2,874 lines. About 25 routes are still defined inline beside 26 route modules: sync keys `:2163-2188`, invites `:2202-2243`, GitHub `:1642, 2314-2377`, resolve `:1967`, catalogue `:1940`, proposals `:2527`, approvals `:1674`, sandbox purge `:2574`, auth session `:1144-1297`. The 78 other root files (≈30 `*Store.js`, auth, AI, mail, mesh) are flat in one directory. | `grep -n "router\.(get\|post…)"` on `index.js` | CONFIRMED |
| W9 | **A second front end lives inside the server.** `serverXR/src/lighting/ui/` (`app.js` 6,224 + `index.html` 929 + `style.css` 1,436) is a vanilla-JS app with no React and no shared components, served at `/light/`. It is deliberate (the desk must run alone: `lighting/standalone.js`). Its UI conventions and words are kept apart from `src/`. | sizes cited | CONFIRMED (design choice; flagged, not a fault) |
| W10 | **Dead code.** Unreached and unused except by tests or nothing at all: 12 algoVrithm sequence files + `TransitionVeil.jsx`, `glyphAtlas.js`, `lightField.js` (4,364 lines, last 08-19; `landing/fonts.css` excluded, it may be linked from HTML). `src/components/EditorToolbar.jsx` (88, last 04-08). `src/kit/kitRoutes.js` (54, only `kitCatalogue.test.js`). `src/raw/director/DispersionPanel.jsx` (145, only `copyVocabulary.test.js`). | walker + `git grep` | CONFIRMED unreached; SUSPECTED safe to delete (string-built imports not seen by the walker) |
| W11 | **cPanel leftovers in `public/`.** `public/clear-default-scene.php`, `upload-default-scene.php` and `public/serverXR/{.htaccess,serve-asset.php}` (last 04-01) are excluded from Docker (`.dockerignore:12-19`) and named by nothing in `src/`, `serverXR/` or `scripts/`. `deploy/AGENTS.md:22` still lists a cPanel workflow. Is that channel still alive? Slice B owns that question. | paths cited | SUSPECTED dead |
| W12 | **Content inside the code repo.** `spaces/network/` holds 145 files: 54 page manifests generated from `people.json`, which names real people. `spaces/README.md` says `--all` pushes them over live with no read-back. The pattern elsewhere is that a space's content lives in its own repo (`br_id_ge`, `beyond_form`, `platform_recordar`). | `spaces/README.md` | CONFIRMED location; consent/provenance of `people.json` not checked here (owed) |
| W13 | **A rig photo with no source record.** `public/rigbuild/items/photos/up-pdu60b.jpg` (added `f93211ad`, 09-28) has no `photo` entry with author or licence in `src/rigbuild/items/*.json`. The other 17 photos each name an author and a free licence (CC BY / BY-SA / CC0 / PD). | python scan of `items/*.json` | CONFIRMED missing record |
| W14 | **"rig" means two things in code.** `src/rig/` and `serverXR/src/rig/` are rig protocol 1: *machines* on a LAN (discovery, blackout, sinks). `src/rigbuild/` and `src/rigMirror/` are the *lighting* rig (lamps, patch, looks). `docs/ai/vocabulary.md` defines neither. | headers of `serverXR/src/rig/index.js`, `src/rig/rigEvents.js` | CONFIRMED |
| W15 | Agent instruction files inside source folders: `serverXR/src/{AGENTS,CLAUDE,GEMINI}.md` and `src/shared/{AGENTS,CLAUDE,GEMINI}.md`. Slice C owns docs. | `ls` | CONFIRMED, minor |

---

## 3. Duplicates and overlaps

| # | Two (or more) ways | Which is live | Evidence | Status |
| --- | --- | --- | --- | --- |
| D1 | **Project schema ×2.** `src/shared/projectSchema.js` (2,752) and `shared/projectSchema.cjs` (2,717), kept by hand. The same holds for `placement`, `nameMatch` and `sceneSchema`. | Both. A drift test (`serverXR/src/schemaSync.test.js`) guards them. | `shared/projectSchema.cjs:1-8` says it is a manual mirror *"because that file transitively imports the browser-only node registry"*. Today `src/shared/projectSchema.js:1-2` imports only `placement.js` and `productionVersions.js`, both pure. The stated reason is gone. | CONFIRMED |
| D2 | **Three renderers for one project document**, plus V1's: `components/LiveProjectScene.jsx` (2,172, walk/public/jam/build/wcc), `studio/components/StudioViewport.jsx` (1,324, Studio + orbit viewer + plot), `raw/components/RawViewport.jsx` (1,511, Nodes, Make, Studio world, card previews) and V1 `components/SceneCanvas.jsx`. | All live. The public viewer uses **two** of them (`PublicProjectSceneSurface.jsx:18-19`: walk → Live, orbit → Studio). | `src/project/viewport/rendererParity.test.js:1-6`: *"That duplication shipped real drift twice … audio/light/group entities were silently dropped from the public viewer."* | CONFIRMED |
| D3 | **Two lighting-desk clients.** `src/map/lightingLink.js` (`lightingApiUrl`) and `src/raw/utils/dmxRigClient.js:157` (`deskApiBase`). Nodes' DMX Out also has a third output lane, `vizzz` (`raw/components/DmxOutPanelWindow.jsx:161`). | Both live. | paths cited | CONFIRMED |
| D4 | **Two models of a "look".** The document's `rigLooks` (rule + numbers per group, `src/rigbuild/looks.js`, 474) and the desk's looks-as-steps (`serverXR/src/lighting/looks.js`, 363). They are bridged by `CardsSurface.jsx:346` POST `api/looks/add`. | Both live, bridged. | headers of both files | CONFIRMED that two exist; SUSPECTED a design overlap that wants one owner decision, not a code move |
| D5 | **Two document models on the server.** The V1 space scene (`/api/spaces/:id/scene`, `/ops`, `/events`, `sceneSchema`) and the project document (`/api/projects/:id/document`, `/ops`, `/events`, `projectSchema`). Also two asset stores (space assets and project assets) plus commons. Client sync: `services/sceneSyncService.js` (V1) and `project/services/projectSyncService.js`. | Both live. The scene side exists for V1. | `routes/spaceRoutes.js:736,795,851,1117`; `routes/projectRoutes.js` | CONFIRMED |
| D6 | **Four ways to move a space between installs:** `di follow` (`serverXR/src/follow/`, the owner's rule since 10-04); whole-scene push/pull (`routes/syncRoutes.js`, `/api/sync/spaces/:id/{status,pull,push}`, used by `components/SpaceSyncPanel.jsx`, a V1 panel); sync keys + scripts (`syncKeyStore.js`, `scripts/space-sync.mjs`, `space-push`, `project-pull`, `tier-sync`); the GitHub App (`githubApp.js`, `spaceLinkStore.js`, `spaceSyncPlan.js`, which says it must stay *"in lockstep with scripts/space-sync.mjs"*). | Follow is the declared path. The other three are still mounted. | paths cited | CONFIRMED that all four are mounted; SUSPECTED that syncRoutes + SpaceSyncPanel are superseded by follow |
| D7 | **Four realtime transports.** Socket.IO (`socketHandlers.js` 1,042; client `hooks/useSpaceSocket.js`, `chat/*`, `project/hooks/useProjectPresence.js`, `kit/kitStack.js`); SSE (`/events` on spaces and projects, `/api/rig/events`, desk mirror, NDI); a raw WebSocket hub (`meshHub.js`, for br_id_ge); HTTP polling (`SpaceSurfaceApp.jsx:13`, every 2 s). | All live, each for a reason given in its header. | `git grep` of `socket.io-client`, `new EventSource`, `new WebSocket` | CONFIRMED; not a defect by itself, but there is no single page that says which to use for new work |
| D8 | **Two "who else is out there" layers.** `serverXR/src/rig/` (UDP LAN discovery, members, protocol 1) and `serverXR/src/machines/` (machines sharing a space through a follow; signalling). | Both live. | headers of `rig/discovery.js`, `machines/hub.js` | SUSPECTED overlap |
| D9 | **Two cue runners in name.** `src/rigbuild/cueRun.js` is the page-side client of `serverXR/src/lighting/cuerun.js`. The header says the page runs no timer of its own. | Server is live. The client is a thin caller. | `cueRun.js:1-6` | CONFIRMED *not* a duplicate (recorded so nobody "fixes" it) |
| D10 | **17 address parsers and one 920-line dispatcher**, plus reserved words in `shared/reservedSegments.cjs` (server) and `src/shared/nameMatch.js` (client). A new tool means a new parser, a new `if` in `RootApp.jsx` and a reserved word. | Live. | `git ls-files 'src/**/*Routing.js'` | CONFIRMED |

---

## 4. One target layout

**The rule it follows.** A folder answers *"what does a person open?"* (a tool) or *"what does
every tool stand on?"* (the engine). Generic folders hold only generic things. A show or a work
never lives in the platform.

```
src/
  app/            RootApp, index.jsx, ONE route table (every surface + its gate), SpaceSurfaceApp
  engine/         was src/project + src/shared + src/timeline + src/objectComponents:
                  document, ops, schema (the single source), viewer renderer, viewport
  tools/          one folder per thing a person opens:
                  studio/ nodes/ (was raw) projection/ (was map) make/ scan/ jam/ perform/
                  rig/ (was rigbuild + rigMirror) chat/ kit/ wiki/ landing/ pages/ admin/
  lighting/       ONE desk client (lightingLink + dmxRigClient), shared by every tool
  machines/       was src/rig (rig protocol client), named for what it is
  ui/             truly generic UI only: AuthGate, AccountButton, dialogs, PanelShell
  works/          registry + works/algovrithm/ (with its director) + works/wcc/
  legacy-v1/      App.jsx + its 106 files, fenced, until V1 is retired
serverXR/src/
  index.js        wiring only; every route in routes/
  routes/  stores/  auth/  ai/  sync/ (follow, syncKeys, GitHub, syncRoutes)
  lighting/ (desk + its ui, unchanged)  rig/  machines/  ndi/  catalogue/
shared/           GENERATED .cjs from engine/schema (or the server imports the ESM); never hand-kept
```

Show data (MOXIR's inventory, fixture library and photos) leaves the bundle. It becomes the
production's own content in the `moxir` space (or a production repo), loaded at runtime the way
`media.json` already loads its files. The platform keeps the generic code and an empty, sourced
type library.

### Move list, ranked by value ÷ risk

"After show" means after the MOXIR show on **17 October 2026**. Before then, nothing that the show's
pages, the desk, the room view or the follow path load may move.

| Rank | From → To | Value | Risk | When | Status of the evidence |
| ---: | --- | --- | --- | --- | --- |
| 1 | Delete the dead files in W10 (≈4,650 lines) | Less to read, no false leads | Very low: unreached, and the bundle is unchanged | **May go before the show**, on its own branch, after one build | CONFIRMED unreached |
| 2 | Record the source and licence of `up-pdu60b.jpg`, or remove it (W13) | Law (owner rule 7) | None | Before the show | CONFIRMED |
| 3 | `shared/*.cjs` hand mirrors → generated from `src/shared` at build, or the server loads ESM (D1) | Removes the biggest hand-kept copy (≈3,300 lines) | Medium: server boot path | After show | CONFIRMED |
| 4 | `src/map/lightingLink.js` + `src/raw/utils/dmxRigClient.js` → `src/lighting/deskClient.js` (W3, D3) | One way to reach the desk | Medium: 17 importers, all show-critical | **After show** | CONFIRMED |
| 5 | Admin out of V1: `components/PreferencesPage.jsx` + `components/preferences/*` + the 4 services → `src/tools/admin/`, mounted without `useAppState` (W2) | Admin stops loading an editor; V1 can then be fenced | Medium | After show | CONFIRMED |
| 6 | V1 → `src/legacy-v1/` (`App.jsx`, the 11 root panels, `state/`, `contexts/`, the 52 hooks, 24 components, 7 services) (W1) | The generic folders become generic; V1's real size is visible | Low in logic, high in diff size | After show, after rank 5 | CONFIRMED |
| 7 | `src/raw/director/` + `editListSource.js` + `timingOverlay` keys → `src/algoVrithm/director/` (W5) | Restores the works boundary | Low | After show | CONFIRMED |
| 8 | `src/rigbuild/{gdtf,mvr,patchPlan,deskLookValues}.js` → `shared/rig/` (node + browser) or `scripts/rigbuild/lib/` (W6) | Clear which code ships to browsers | Low, but scripts the show uses | After show | CONFIRMED |
| 9 | MOXIR data out of the bundle: `src/rigbuild/types/moxir.json`, `items/*.json`, `public/rigbuild/items/*` → the `moxir` space's assets (or a production repo), loaded at runtime (W4) | Platform no longer carries one show; every install's bundle shrinks | **High during the run** | **After show only** | CONFIRMED |
| 10 | `serverXR/src/index.js` inline routes → `routes/{syncKeys,invites,github,resolve,proposals,approvals,admin}Routes.js`; root `*Store.js` → `stores/`, auth → `auth/`, AI → `ai/` (W8) | The server becomes navigable | Medium: route order matters (`index.js:483-546` mounts lighting first on purpose) | After show | CONFIRMED |
| 11 | `LiveProjectScene` + walk/portal/entry files → `src/engine/viewer/`; then decide one renderer for the public viewer (D2) | Ends the drift class that shipped twice | **High**: it is the room the owner watches the show in | After show; the merge is its own project with its own plan | CONFIRMED |
| 12 | One route table: the 17 `*Routing.js` parsers registered in `src/app/routes.js`, reserved words from one file (D10) | A new tool = one row | Medium | After show | CONFIRMED |
| 13 | Retire `syncRoutes.js` + `SpaceSyncPanel.jsx` if follow covers them (D6); then the V1 scene API (D5) when V1 goes | One sync path, per the 10-04 rule | Medium: needs proof no install uses them | After show, after a usage check | SUSPECTED |
| 14 | `src/rig/` → `src/machines/`; add "rig" (lighting) and "machines" (protocol) to `docs/ai/vocabulary.md` (W14) | Words stop colliding | Low | After show; the vocabulary row is the owner's call | CONFIRMED |
| 15 | `public/*.php`, `public/serverXR/` → `deploy/cpanel/shims/`; `legacy/` → `deploy/cpanel/legacy/` or `~/archive` (W11). `android-twa/` → `deploy/android-twa/` | Tidy root | Low | Any time, **with slice B's answer** on cPanel | SUSPECTED |
| 16 | `spaces/network/` → its own content repo like `br_id_ge` (W12) | Content line out of the code line; people data out of a public code repo | Low technically | Owner decision; consent check owed | CONFIRMED location |

### Must NOT move before 17 October 2026

`src/rigbuild/`, `src/rigMirror/`, `src/perform/`, `src/map/` (it holds the desk client),
`src/timeline/`, `src/project/` (viewer, `viewport/`, Smart View), `src/components/LiveProjectScene.jsx`
and its walk files, `src/shared/` + `shared/`, `src/objectComponents/` (spot beam, haze),
`serverXR/src/lighting/`, `serverXR/src/rig/`, `serverXR/src/ndi/`, `serverXR/src/follow/`,
`serverXR/src/machines/`, `serverXR/src/index.js` route order, `public/rigbuild/`, and the
`scripts/rigbuild/*` callers of rank 8. Slice D owns MOXIR and may narrow this list.

---

## What this audit did not do (owed)

- Nothing was built, run or opened in a browser. Reachability is static. Rank 1 needs one build,
  plus a look at `/algovrithm/scene` on dev, before the deletion lands.
- Each server route was not checked for whether anything still calls it (D6, D5, W11). That needs
  access logs from dev and prod.
- Neither `people.json` (W12) nor `public/wcc` (25 MB) was checked for consent or provenance.
- No line-level count of how much the three renderers duplicate. `rendererParity.test.js` is the
  existing measure.
