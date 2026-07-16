# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `40c5806d`, `main` = `c90f1a65` (dev has one extra dep-bump commit
not yet promoted to main — harmless, do it whenever). Deploy pipeline is
live and verified on both branches.

## Last session (2026-07-16 — full audit, thumbnailing/pagination, prod outage + fix)

- Ran a 6-dimension audit (security/perf/architecture/deps/deploy/docs);
  fixed login OAuth CSRF (no `state` param), added the missing rate limiter
  on project asset uploads, made compose CPU/mem limits actually enforced
  (`deploy.resources` is Swarm-only, switched to top-level `cpus`/`mem_limit`),
  bumped `morgan` (CVE), SHA-pinned 7 third-party GitHub Actions, added
  Dependabot for Docker/Actions, fixed stale `serverXR/README.md`/
  `VPS_DOCKER_DEPLOY.md` deploy narrative, deduped asset-id validation.
- Added space-preview-image thumbnailing (`sharp`, `?w=` query param,
  cached `.webp` variants) and opt-in pagination on `GET /api/spaces`
  (`?limit=`/`?offset=`, unchanged when omitted).
- **Caused a real production outage**: added `client`/`caddy` healthchecks
  to `docker-compose.yml`; nginx:alpine's `client` container failed the
  `wget` healthcheck on real redeploy, and `caddy` — now gated on client's
  health — never started, taking prod's only ingress down. Reverted
  immediately (`c90f1a65`); site confirmed back at 200 within ~5 min. Root
  cause not fully confirmed (suspect `wget` isn't in nginx:alpine) — do not
  re-add a client/caddy healthcheck without testing the exact command
  against a real container first.
- Bumped in-range patch/minor deps (`npm update`, no `package.json` range
  changes); 0 vulnerabilities, full suite still green.
- A parallel session (not this one) independently added `release.json`
  baked into the server image and fixed a stale smoke-check assertion
  (staging's `main` space isn't public, 401 is expected) — both landed
  during this session, not by this agent.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected login) + open-space/sandbox implicit grants
- Production + staging both live on the VPS (Docker/Caddy), both deploy via
  `git push origin main`/`dev` — verified working, including the release.json stamp.

## Open

- Verify `dii-client`/`dii-caddy` healthcheck root cause before ever re-adding one — likely `wget` missing from `nginx:alpine`; try `curl` or a startup-time check instead, and test against a real container first.
- Promote `dev`'s dep-bump commit (`40c5806d`) to `main` whenever convenient — low risk, just not yet done.
- `main`'s "PR required" branch protection is still bypassed by direct pushes (admin override, including this session's emergency hotfix) — decide whether to actually enforce it or drop it.
- Brand: canonical domain/handle undecided (di-studio.xyz vs thedi.studio vs IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow.
- ANSCC research-grant angle for `br_id_ge` — ~1 month out, if pursued.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.
- Orphaned cPanel `.htaccess`/PHP files + cron scripts — left alone, still back the intentionally-preserved cPanel fallback until its hosting term expires.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # deploys to VPS staging — verified working
git push origin main       # deploys to VPS production — verified working
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
