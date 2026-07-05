# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`a160bc4` — feat(github-sync): manifest-aware App webhook sync (staging, deploy chain green)
**Prod (`main`) still at `e58a533` code-wise + promoted hub layout: five-window Studio, unified Files library, commons moderation, guest-share gate.**

## Last session (2026-07-05)

- **Walker input fixes (staging, `bc0bb6b`)**: scroll = dolly ("zoom"), never pitches (hi-res wheels used to tilt the camera into the floor); drag-to-look fallback when pointer lock is denied (mouse look was silently dead on Wayland/post-Esc). Root cause: June-29 device-guessing wheel heuristic tuned only on a trackpad.
- **Mistake-proofing infrastructure**: `npm run check:input` (13 input-device contracts on real walker state via dev-only `window.__diiWalkerRef`); reusable `browser-checks.yml` (contracts + responsive sweep) gates **both** staging and prod deploys; auto post-deploy `smoke` job polls `release.gitCommit` then runs smoke-check — full chain verified green. In `browser-checks`, use `npx vite`, NOT `npm run dev` (that launcher spawns its own serverXR and races the seeded one).
- **Pre-push gate hook live** (`.claude/settings.json` + `scripts/pre-push-gate.sh`): lint + schema-sync + wiki check before any session `git push`, exit-2 blocks; `DI_SKIP_PUSH_GATE=1` bypass. Loads from the NEXT session.
- **Pay-once rule codified** (AGENTS + operating contract): a bug fix ships with a known-fixes entry AND a regression guard in the same change. Golden rule added: input handling never guesses the device class.
- **Zone sync solved**: `npm run wcc:promote` (staging→prod document+asset promotion); hub layout promoted, all 11 wcc projects verified identical, prod smoke 9/9.
- **GitHub-sync gap closed (`a160bc4`)**: App webhook path now reads `di-space.json` — include globs → code files, asset globs → referenced-binary upload with URL rewrite (same contract as CI path, pure logic in `spaceSyncPlan.js` + 8 tests; >30MB assets skipped under LVE limits).

## Earlier (2026-07-02, all on prod)

- **Unified content model Phase 1**: one `Files (N)` library in Create (merged project+space assets, badges, delete with 409 usedBy scan); Code window owns viewport toggle + file→URL bridge + embed-URL. Roadmap: `docs/roadmaps/STUDIO_CONTENT_MODEL_UX.md`.
- **Commons moderation** (Ops Graph → Manage) + guest-share gate; **Drive import** (public link + per-user OAuth connect, verified on staging); **five-window Studio** (`PANEL_ID_MIGRATION` migrates persisted ids); local podman stack on 8080.

## What works

- Studio editor (five windows): Create (primitives/lights + unified Files library: import/Drive/Commons, badges, delete), Scene (tree+inspector), World, Share (publish+activity), Code (files + viewport toggle + URL bridge/embed); quick insert; undo/redo; layout persists
- Beta editor: graph-first layout, node palette, undo/redo, outliner
- WCC exhibition: LiveProjectScene renderer, WASD + mouse/trackpad controls, portals, atmosphere, billboard text; viewport: left-drag rotate, right-drag pan, scroll zoom
- Auth: session-cookie login, roles (guest/viewer/editor/admin), GitHub/Google OAuth, session auto-refresh
- Admin UI: Ops Graph → Manage — spaces/projects/people/roles + GitHub sync per space
- GitHub → space sync LIVE on prod (App webhook + scoped sync-keys; rotation runbook in docs/ops)
- Deploy: push `dev` → staging, push `main` → prod (`publish-cpanel-prebuilt-v2.yml`) — gated on `browser-checks.yml` (input contracts + responsive sweep), auto post-deploy smoke; local: podman/docker compose on 8080
- Space sync: `npm run space:new/pull/push` + SpaceSyncPanel
- WCC staging→prod promotion: `npm run wcc:promote [-- --project <id>] [-- --dry-run]` (`scripts/promote-wcc-projects.mjs`) — pulls a project's document + referenced assets from staging and pushes to prod; replaces the old one-off scratch script

## What is broken / open

- **Drive on prod**: redirect URIs + consent screen publish done, verified working on staging — still needs verifying live on prod, and Google's OAuth verification (sensitive scope, needed past ~100 users) is a manual submission only the user can make. Doc: `docs/ops/GOOGLE_DRIVE_INTEGRATION.md`.
- GitHub-sync: App webhook reaches prod only (one webhook URL per GitHub App — staging syncs via the CI path). Webhook path is now manifest-aware (di-space.json: include globs + referenced-asset upload with URL rewrite), same contract as the CI path — **not yet exercised against a real repo push**; verify on the next br_id_ge push.
- VR fly unverified on hardware; `origin/self-host` intentionally 1 commit ahead (`b9baa30`).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
