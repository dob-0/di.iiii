# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`1b6567f` — feat(deploy): bake GitHub-sync env vars into generated server .env
**On `dev` AND `main` (promoted → prod, live on di-studio.xyz). GitHub→space sync fully live + proven end-to-end on prod with a real push.**

## Last session (2026-07-01)

- **One-click "GitHub → space" sync is LIVE ON PROD** (di-studio.xyz) and proven end-to-end: a real `git push` to `dob-0/br_id_ge` fired the App webhook → space auto-synced → new landing live, zero manual steps.
- **New backend**: `githubApp.js` (App JWT→install token, webhook HMAC, via `node:https`), `spaceLinkStore.js` + `space_links` table, `syncKeyStore.js` + `space_sync_keys` (scoped per-space editor tokens), webhook receiver `POST /serverXR/api/github/webhook`, link routes `/api/spaces/:id/github-link`, `httpClient.js`. Specs in `docs/architecture/SPEC_*`.
- **New UI**: GitHub sync panel in `/admin → Manage → space` (`AdminManageSection.jsx`), wiki article `github-sync`.
- **GitHub App**: ID `4178187`, install `143408136` on `dob-0/br_id_ge`. Env vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH` → `~/dii-space-sync.*.pem`, `GITHUB_APP_WEBHOOK_SECRET`, `SELF_API_URL`) are now **durable**: baked into `.env.generated` from `~/.config/dii/<env>.deploy.env` via `write-server-env.mjs` allowlist — survive every deploy. **STILL TODO: rotate the App private key + webhook secret — both passed through chat.**
- **cPanel gotchas (all in known-fixes)**: (1) deploy git-cleans app dir → `.pem` lives in `~/`; (2) `fetch`/undici WASM-OOMs under LVE → `node:https`; (3) Passenger doesn't bind `config.port` → `SELF_API_URL` points sync at the public origin; (4) apply step overwrites `.env` → vars must come from the deploy config, not manual edits.
- **br_id_ge landing**: recreated as Armenian-ritual v.0000 (WebGL/Three.js, `index.html` 28KB) and pushed to `dob-0/br_id_ge` main (`f7a0bb0`) — now the pilot for the sync.

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
- **GitHub → space sync (LIVE, prod)**: link a space to a GitHub repo in `/admin → Manage → space → GitHub sync`; `git push` auto-updates the space via the `dii-space-sync` App webhook. Scoped sync-keys (`syncKeyStore`) allow CI/token-driven pushes to a single space.

## What is broken / open

- **SECURITY TODO — rotate GitHub App secrets**: the App private key (`~/dii-space-sync.2026-06-29.private-key.pem`) AND webhook secret both passed through chat. Regenerate the key in the App settings (delete old, replace the `.pem` in prod+staging `~/` and the `_PATH` env), reset the webhook secret (update `GITHUB_APP_WEBHOOK_SECRET` in both `~/.config/dii/*.deploy.env`), redeploy.
- **GitHub-sync caveat**: App webhook only reaches **prod** (`di-studio.xyz`); staging can't receive real pushes (use Disconnect/Connect to force a sync there). Sync currently pulls only the `entry` file (`index.html`); repo `assets:` in `di-space.json` are not yet fetched by the App path.
- **Zone positions not synced staging↔prod**: entity positions in WCC exhibition live in the DB. Edits in Studio on staging must be manually pushed via `node scratchpad/copy-staging-to-prod.mjs`.
- **VR fly unverified on hardware** — AR confirmed on Android; VR path (right-thumbstick-Y) only build-checked.
- WCC landing perf: always-on WebGL particle veil (700 pts) — gate on mobile/`prefers-reduced-motion` if needed.
- `origin/self-host` — intentionally kept: 1 unmerged commit (`b9baa30`) stripping contributor machinery for clean self-host build.

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
