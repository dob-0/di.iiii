# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`1b6567f` — feat(deploy): bake GitHub-sync env vars into generated server .env
**On `dev` AND `main` (promoted → prod, live on di-studio.xyz). GitHub→space sync fully live + proven end-to-end on prod with a real push.**

## Last session (2026-07-02)

- Gated the WCC landing's WebGL particle veil (700 pts) off on mobile and `prefers-reduced-motion` — `useViewportMode` gained a reactive `prefersReducedMotion` field for this.
- Code-reviewed the fix (8-angle pass): removed a redundant guard and de-duplicated the `matchMedia` check into the shared hook instead of a local one-off.
- Extended reduced-motion gating to the rest of `src/wcc/landing/LandingPage.jsx`: hero/circle entrance, section-reveal wipe, cursor parallax, click particle-burst all skip under reduced-motion; the horizontal ScrollTrigger nav keeps `scrub` (user-driven) but drops the auto-eased `snap`.
- Verified live in-browser via Playwright at each step (desktop/mobile/reduced-motion contexts, gsap inline-style presence as proof of skip, resize-across-breakpoint probing) — lint/build clean throughout, nothing committed yet.

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y), view-centred + double-click placement
- Studio viewport controls: left-drag = rotate, right-drag = pan, scroll/pinch = zoom, trackpad two-finger swipe = rotate
- WCC exhibition controls: WASD walk, mouse (click to lock) or trackpad two-finger swipe = look-around, F = fly, ESC = release lock
- Portal object: Studio entity referencing another project (embed or gateway); 14th type in `EntityContent`
- Auth: session-cookie login, role-based access (guest/viewer/editor/admin); GitHub/Google OAuth; session auto-refreshes from DB on `GET /api/auth/session` so admin patches propagate without re-login
- Admin UI: Ops Graph → Manage → People panel — set role (viewer/editor/admin), toggle space access per user
- Deploy: push `dev` → staging.di-studio.xyz, push `main` → di-studio.xyz (via `publish-cpanel-prebuilt-v2.yml`)
- Docker: `docker compose up --build -d` runs full stack locally on port 8080
- WCC exhibition: LiveProjectScene renderer, WASD + mouse/trackpad FPS controls, portal embeds, atmosphere blend, hub decor, animated entities, billboard text
- Space sync: `npm run space:new/pull/push` + SpaceSyncPanel UI
- **GitHub → space sync (LIVE, prod)**: link a space to a GitHub repo in `/admin → Manage → space → GitHub sync`; `git push` auto-updates the space via the `dii-space-sync` App webhook. Scoped sync-keys (`syncKeyStore`) allow CI/token-driven pushes to a single space. Secret rotation runbook: `docs/ops/ROTATE_GITHUB_APP_SECRETS.md`.

## What is broken / open

- **GitHub-sync caveat**: App webhook only reaches **prod** (`di-studio.xyz`); staging can't receive real pushes (use Disconnect/Connect to force a sync there). Sync currently pulls only the `entry` file (`index.html`); repo `assets:` in `di-space.json` are not yet fetched by the App path — the token-driven CI path (`br_id_ge/.github/workflows/sync-space.yml` via `scripts/sync-space.mjs`) covers `references/**` assets via repo secret `DI_SPACE_TOKEN` (a `br_id_ge`-scoped sync-key, minted 2026-07-01, 1y TTL) — workflow is green.
- **Zone positions not synced staging↔prod**: entity positions in WCC exhibition live in the DB. Edits in Studio on staging must be manually pushed via `node scratchpad/copy-staging-to-prod.mjs`.
- **VR fly unverified on hardware** — AR confirmed on Android; VR path (right-thumbstick-Y) only build-checked.
- `origin/self-host` — intentionally kept: 1 unmerged commit (`b9baa30`) stripping contributor machinery for clean self-host build.
- **Google Drive asset import — implemented, uncommitted on `dev`, not deployed**: paste-a-link import + per-user "Connect your Drive" OAuth, both wired end-to-end (backend `googleDrive.js`/`googleOAuth.js`/`driveTokenStore.js`, `AssetPanel` UI). Tests/lint/build all green locally. Needs before shipping: add Drive scope + redirect URI in Google console, set `GOOGLE_API_KEY` for folder imports. Setup doc: `docs/ops/GOOGLE_DRIVE_INTEGRATION.md`.

## Space sync setup (per machine)

Add to `serverXR/.env.local` (gitignored):
```
LIVE_API_URL=https://di-studio.xyz/serverXR
LIVE_API_TOKEN=<editor-or-admin-token>
```

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy

```bash
git push origin dev                                                   # staging
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev   # prod
gh run list --workflow publish-cpanel-prebuilt-v2.yml                 # monitor
```

## Validation

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
