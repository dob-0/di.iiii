# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `2fad86b4` (pushed) — deep-audit remediation: security (auth
defaults, rate-limit topology, OAuth CSRF secret), perf (asset-delete N+1,
projectStore double-stringify), cPanel→VPS doc rewrite, WCC/Beta wiki
entries. `main` = `3e88adba`, unchanged this session.

## Last session (2026-07-16 — deep audit + remediation, deploy-pipeline gap found)

- Ran a 5-dimension audit (architecture/security/perf/dead-weight/wiki-drift)
  against the just-completed VPS migration; fixed confirmed findings on
  `dev`, pushed `1cce950d`..`2fad86b4`.
- **Critical: `deploy-vps.yml`/`deploy-vps-staging.yml` have never had a
  successful run** — `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_KEY` secrets and
  `VPS_DEPLOY_PATH`/`VPS_STAGING_DEPLOY_PATH` variables were never set in the
  GitHub repo (confirmed via `gh secret/variable list`). Production is live
  but was deployed by hand — no `release.json`, `/api/health`'s `release` is
  all-null, so there's no way to confirm what commit is actually running.
  At least 3 `main` commits since the manual deploy (#63–65) never auto-deployed.
- Confirmed via the live `/serverXR/api/auth/session` endpoint that the real
  VPS `.env` already has `REQUIRE_AUTH=true` — the compose-file default fix
  this session closes a latent risk for the *next* redeploy, not a live hole.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Production is live on the VPS (Docker/Caddy), manually deployed; cPanel
  auto-publish is disabled (workflow_dispatch only).

## Open

- **VPS deploy pipeline unwired**: needs `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_KEY`
  + `VPS_DEPLOY_PATH`/`VPS_STAGING_DEPLOY_PATH` set in GitHub before a push
  deploys anything (someone with VPS/GitHub-admin access) — see
  `docs/deploy/VPS_DOCKER_DEPLOY.md`. No `release.json` yet either, so even a
  working pipeline can't be verified via `/api/health` until that's added.
  Confirm what's actually running on the VPS before assuming it matches `main`.
- Staging DNS record still doesn't exist (`STAGING_DOMAIN` unset).
- Manual click-through still owed: homepage buttons, br_id_ge dropdown order/cross-nav.
- Brand: canonical domain/handle undecided (di-studio.xyz vs thedi.studio vs
  IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow.
- ANSCC research-grant angle for `br_id_ge` — ~1 month out, if pursued.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
# NOTE: pushing does NOT currently deploy anything — see "Open" above.
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
