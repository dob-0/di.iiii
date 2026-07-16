# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `40c5806d`, `main` = `c90f1a65` (dev has one extra low-risk dep-bump
commit not yet promoted). Deploy pipeline is live and verified on both
branches; prod confirmed healthy post-incident (see below).

## Last session (2026-07-16 — deploy pipeline made real, full audit, one incident)

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

- Do not re-add a `client`/`caddy` healthcheck without testing the exact
  command against a real running container first (suspect `wget` missing
  from `nginx:alpine`; try `curl` or a startup-time-only check).
- Promote `dev`'s dep-bump commit (`40c5806d`) to `main` whenever — low risk.
- `main`'s "PR required" branch protection is still bypassed by direct
  pushes (admin override, including this session's emergency hotfix) —
  decide whether to actually enforce it or drop it.
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
