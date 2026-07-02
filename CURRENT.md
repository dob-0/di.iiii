# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`c158e20`..HEAD — five-window Studio on prod; commons moderation + guest-share gate + **unified content model (Phase 1)** on `dev`/staging.
**Prod (main) is at the five-window consolidation. dev adds: admin commons moderation, share-requires-account, and the unified Files library — promote when verified on staging.**

## Last session (2026-07-02)

- **Unified content model Phase 1 (dev)**: one `Files (N)` library in Create (project+space assets merged by content-hash id; residency text, `in scene ×N` + `public` badges; +Add/Share/URL/delete row); asset DELETE routes (project + space, space delete has 409 usedBy scan + `?force=1` + commons unshare on origin); previously-dead `deleteAsset` op wired + tested; Code window owns the 3D↔code viewport toggle (moved from Share), gets a "Project file → Insert URL at cursor" bridge, file rename with href/src rewrite, and an Embed-external-URL section (`codeSourceType:'url'` now reachable); QuickInsert hidden-project-assets bug fixed. Roadmap: `docs/roadmaps/STUDIO_CONTENT_MODEL_UX.md`; wiki article `studio-content-model` linked from Create+Code. 387+23 tests, Playwright-verified.
- **Commons moderation (dev)**: admin "Asset commons" section in Ops Graph → Manage (search/View/Remove; `DELETE /api/commons/assets/:id` admin-gated). **Guest-share gate (dev)**: publishing to the commons requires a signed-in session; share errors surface in the Create window.
- **Google console done by user**: staging+prod redirect URIs added, consent screen published; Drive connect verified working on staging.

- **Google Drive import + asset commons (on prod)**: shared `useDriveImport.js`; public-link route uses the caller's Drive token (folders work per-user without `GOOGLE_API_KEY`); `public_assets`/`commonsStore.js` share/browse/stream/import (content-hash copy). Verified live.
- **Studio five-window consolidation (`c158e20`, on prod)**: 9 windows → **Create / Scene / World / Share / Code**; persisted ids migrate via `PANEL_ID_MIGRATION` (StudioShell.jsx); golden rule added (five windows are fixed — new features land inside them). Fixed silent invisible-entity bug (space/commons assets now upserted into `document.assets` — `handleCreateFromAsset`); **+ Add** on space files; panels cascade instead of overlapping; selection pill z-capped; format registry + gated + Add (`src/studio/utils/assetFormats.js`); **PDF import** rasterizes pages to image entities (new dep `pdfjs-dist`, lazy); double-click Quick Insert now shares one palette with Create (`entityPalette.js`) + "More ▸" opens Create. Playwright-verified; wiki updated.
- Local podman test stack: full stack on 8080 (`podman compose up --build -d`; docker-compose v5 provider at `~/.docker/cli-plugins/`, rootless `podman.socket`).

## What works

- Studio editor (five windows): Create (primitives/lights + unified Files library: import/Drive/Commons, badges, delete), Scene (tree+inspector), World, Share (publish+activity), Code (files + viewport toggle + URL bridge/embed); quick insert; undo/redo; layout persists
- Beta editor: graph-first layout, node palette, undo/redo, outliner
- WCC exhibition: LiveProjectScene renderer, WASD + mouse/trackpad controls, portals, atmosphere, billboard text; viewport: left-drag rotate, right-drag pan, scroll zoom
- Auth: session-cookie login, roles (guest/viewer/editor/admin), GitHub/Google OAuth, session auto-refresh
- Admin UI: Ops Graph → Manage — spaces/projects/people/roles + GitHub sync per space
- GitHub → space sync LIVE on prod (App webhook + scoped sync-keys; rotation runbook in docs/ops)
- Deploy: push `dev` → staging, push `main` → prod (`publish-cpanel-prebuilt-v2.yml`); local: podman/docker compose on 8080
- Space sync: `npm run space:new/pull/push` + SpaceSyncPanel

## What is broken / open

- **Drive on staging/prod needs Google console work**: staging/prod redirect URIs on the OAuth client; consent screen is in Testing mode (test users only) — publish + verification before public launch. Doc: `docs/ops/GOOGLE_DRIVE_INTEGRATION.md`.
- GitHub-sync: App webhook reaches prod only; App path pulls entry file only (CI path covers assets via `DI_SPACE_TOKEN`).
- Zone positions not synced staging↔prod (manual `scratchpad/copy-staging-to-prod.mjs`).
- VR fly unverified on hardware; `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Commons follow-ups: admin moderation view; guest-share policy decision.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
