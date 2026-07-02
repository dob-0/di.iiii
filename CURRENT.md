# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`c158e20` — feat(studio): consolidate shell to five windows (Create/Scene/World/Share/Code)
**Pushed to `dev` AND merged to `main` — staging + prod both deployed (workflows green, smoke checks pass). Prod now runs Drive import, asset commons, and the five-window Studio.**

## Last session (2026-07-02)

- **Google Drive import shipped to `dev`**: shared `src/hooks/useDriveImport.js` (classic + Studio); fixed double-JSON bodies in `serverSpaces.js` (broke ALL public-link imports); public-link route also uses the caller's Drive token (`spaceRoutes.js`) — folders work per-user without `GOOGLE_API_KEY`; Drive section auto-lists recent files on open. Verified live end-to-end (connect → folder import) on the local stack.
- **Asset commons shipped to `dev`**: `public_assets` + `commonsStore.js` (5✓); share/unshare, `GET /api/commons/assets[?q=]`, public streaming, `import-commons` (content-hash copy); Share toggle + Commons browse in the Create window. Verified via curl.
- **Studio five-window consolidation (`c158e20`, on prod)**: 9 windows → **Create / Scene / World / Share / Code**; persisted ids migrate via `PANEL_ID_MIGRATION` (StudioShell.jsx); golden rule added (five windows are fixed — new features land inside them). Fixed silent invisible-entity bug (space/commons assets now upserted into `document.assets` — `handleCreateFromAsset`); **+ Add** on space files; panels cascade instead of overlapping; selection pill z-capped; format registry + gated + Add (`src/studio/utils/assetFormats.js`); **PDF import** rasterizes pages to image entities (new dep `pdfjs-dist`, lazy); double-click Quick Insert now shares one palette with Create (`entityPalette.js`) + "More ▸" opens Create. Playwright-verified; wiki updated.
- **Local podman test stack**: full stack on 8080 (`podman compose up --build -d`; docker-compose v5 provider at `~/.docker/cli-plugins/`, rootless `podman.socket`). Google console: localhost redirect URI + test user registered; Drive connect works locally.
- Earlier in session (committed): WCC reduced-motion `db76d23`, dev-browser fix `6898772`, VR-fly hints `bfb0da3`.

## What works

- Studio editor (five windows): Create (primitives/lights/import/Drive/Commons/files), Scene (tree+inspector), World, Share (publish+presentation+activity), Code; double-click quick insert; undo/redo; workspace layout persists
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
