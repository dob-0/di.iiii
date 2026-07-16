# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `main` = `19f56ade` on `dev` / `97326544` on `main` (docs-only
commit after `main` was cut — harmless, not yet promoted, no rush). Deploy
pipeline is live and verified on both branches; both staging and
production confirmed healthy (see below).

## Last session (2026-07-16 — deploy pipeline made real, full audit, one incident, live sign-in bug — two attempts, second one real)

- User reported OAuth sign-in on `di-studio.xyz` failing with "Sign-in
  failed — please try again." **First fix attempt (wrong theory)**: suspected
  the CSRF `state` commit's fallback secret was random-per-process and broke
  across container restarts. Shipped it, redeployed, user confirmed it
  worked. **~24 minutes later, user reported it broke again — both GitHub
  and Google.** SSHed into the VPS (`ssh dii-vps`, alias now saved to
  `~/.ssh/config` — no need to ask for the host again) and found the first
  theory was wrong: `AUTH_SESSION_SECRET` was already correctly set on both
  prod and staging the whole time.
- **Real root cause, found by curling the live endpoint**: two `curl`s to
  `/api/auth/github` seconds apart returned the byte-identical `state`
  value. `router.get('/api/auth/github', passport.authenticate('github',
  { state: signLoginState(stateSecret) }))` calls `signLoginState()` once,
  at route-registration time (server startup) — not per request — so every
  login shared one state token for the container's entire life. That token
  is only valid for `STATE_TTL_MS` (10 min), which is exactly why the first
  fix's redeploy "worked" (fresh state, timestamp ≈ startup) and then broke
  again once 10 minutes passed. Fixed by wrapping `passport.authenticate` in
  a per-request handler so the state is signed fresh every time. Regression
  test calls the authorize handler twice and asserts the state differs.
  Verified live: two direct `curl`s to both `/api/auth/github` and
  `/api/auth/google` on prod now return different `state` each time.
  Full writeup (including the wrong first theory, kept for the record):
  `docs/ai/known-fixes.md`; general lesson codified in
  `docs/ai/golden_rules.md` ("Never call a per-request-value function as an
  argument to `router.get(path, middlewareFactory(...))`").
- **Separate, still-open finding**: `staging.di-studio.xyz` has OAuth fully
  unconfigured (`GITHUB_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`,
  `OAUTH_CALLBACK_BASE_URL` all empty in `/opt/di.iiii-staging/.env`,
  confirmed via `GET /api/auth/providers` → `{github:false,google:false}`).
  Sign-in on staging cannot work until real OAuth app credentials for that
  domain are added — needs a human with GitHub/Google developer console
  access, not a code fix. Not done this session.
- Both fixes pushed to `dev`, promoted to `main`, deployed to both staging
  and production — `/api/health` on both confirms the latest commit,
  healthy.
- Found `deploy-vps.yml`/`deploy-vps-staging.yml` had never had a successful run
  (no GitHub secrets/variables set, production was live but deployed by hand).
  Wired both up, did the one-time staging setup (`/opt/di.iiii-staging`, fresh
  secrets, `staging.di-studio.xyz` repointed from its old prod-alias), and
  verified real end-to-end deploys — fixing bugs only exposed by actually
  exercising the path: an untracked Caddy-hardening override, config drift
  (workflows never synced compose/Caddyfile from git), a Caddy crash-loop from
  a misplaced env default, a missing `actions/checkout`.
- Ran two audits (this session + a parallel session working the same repo
  throughout — merged cleanly all day): fixed CPU limits never enforced under
  plain `docker compose` (Swarm-only `deploy.resources`, switched to top-level
  `cpus`/`mem_limit`), login OAuth CSRF (no `state` param), missing rate limit
  on asset uploads, a `morgan` CVE, SHA-pinned GitHub Actions, deduped asset-id
  validation, renamed `smoke-check-cpanel.mjs` → `smoke-check.mjs`, added
  space-preview thumbnailing + `GET /api/spaces` pagination.
- Baked `release.json` into the server image so `/api/health` can self-report
  `deployEnv`/`gitCommit` — verified on both prod and staging.
- **Caused a real production outage**: a healthcheck added to `client`/`caddy`
  failed on `nginx:alpine` (likely `wget` behavior, not fully root-caused),
  and `caddy`'s `depends_on: service_healthy` on client meant Caddy never
  started — prod's only ingress was down for a few minutes. Restored manually
  (`docker start dii-caddy-1`), then reverted the healthcheck commit
  (`c90f1a65`) and redeployed. **Confirmed clean now**: all containers up,
  `/api/health` on `di-studio.xyz` reports `gitCommit: c90f1a65...`, healthy.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected login) + open-space/sandbox implicit grants
- Production + staging both live on the VPS (Docker/Caddy), both deploy via
  `git push origin main`/`dev` — verified working end-to-end, release.json included.

## Open

- `staging.di-studio.xyz` has no OAuth configured at all (empty
  `GITHUB_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`,
  `OAUTH_CALLBACK_BASE_URL` in `/opt/di.iiii-staging/.env`) — sign-in on
  staging can't work until someone with GitHub/Google developer console
  access creates OAuth app credentials for that domain and sets them there.
- Do not re-add a `client`/`caddy` healthcheck without testing the exact
  command against a real running container first (suspect `wget` missing
  from `nginx:alpine`; try `curl` or a startup-time-only check).
- `main`'s "PR required" branch protection is still bypassed by direct
  pushes (admin override, used again this session for the sign-in fix and
  the earlier emergency hotfix) — decide whether to actually enforce it or
  drop it.
- Brand: canonical domain/handle undecided (di-studio.xyz vs thedi.studio vs
  IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow.
- ANSCC research-grant angle for `br_id_ge` — ~1 month out, if pursued.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.
- Orphaned cPanel `.htaccess`/PHP files + cron scripts — left alone, still
  back the intentionally-preserved cPanel fallback until its hosting term expires.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # deploys to VPS staging — verified working
git push origin main       # deploys to VPS production — verified working
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
