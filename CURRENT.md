# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `63c6f1d3` (docs-only, one commit ahead of `main`'s `97326544` —
harmless, not yet promoted, no rush). Deploy pipeline is live and verified
on both branches; both staging and production confirmed healthy (see below).

## Last session (2026-07-16 — verified Open Call feature end-to-end, no code changes)

- User asked to test the Open Call feature (public application submission +
  admin review) and confirm it's healthy. No bugs found.
- Local dev backend on port 4000 was up but every route 404'd (stale
  process from an earlier session). Restarted it clean — logs showed
  normal boot (SQLite, Socket.IO, mesh hub all initialized).
- Root cause of the earlier 404s was a red herring, not a real bug: routes
  are mounted under `/serverXR/api/...` locally, not bare `/api/...` — the
  first health probe just hit the wrong path.
- Exercised the real flow directly against the running backend:
  `POST /serverXR/api/open-calls/:callId/applications` (public, rate-limited)
  succeeded and persisted correctly to `data/di.db`; missing-email input
  correctly rejected with `400`; the admin read endpoint
  (`GET .../applications`) correctly returned `401` for an unauthenticated
  request. Cleaned up the dummy test row afterward. User also confirmed the
  Preferences → Open Call UI directly.
- Automated coverage (`openCallStore.test.js`, `httpContracts.test.js`,
  `ViewPanel.test.jsx`) also passes clean, 46/46.

- `staging.di-studio.xyz` OAuth is now fully configured: GitHub via a
  dedicated "staging di" OAuth App (its own client ID/secret, callback
  `https://staging.di-studio.xyz/serverXR/api/auth/github/callback`), Google
  via a pre-existing dedicated "staging di" OAuth client
  (`123917400390-dr28...apps.googleusercontent.com`, redirect URI already
  present). Both wired into `/opt/di.iiii-staging/.env` under the
  `STAGING_GITHUB_CLIENT_ID`/`STAGING_GOOGLE_CLIENT_ID` etc. vars (staging's
  compose override reads `STAGING_`-prefixed names, not the bare ones —
  don't edit the bare `GITHUB_CLIENT_ID`/`GOOGLE_CLIENT_ID` lines in that
  file, they're unused by staging). `GET /api/auth/providers` on staging
  now returns `{github:true,google:true}`; both flows verified live
  end-to-end by the user (successful GitHub + Google sign-in).

### Previous session (2026-07-16 — deploy pipeline made real, full audit, one incident, live sign-in bug fixed)

- Live OAuth sign-in bug on `di-studio.xyz`: real root cause was
  `signLoginState()` called once at route-registration time instead of
  per-request, so every login shared one `state` token that expired after
  `STATE_TTL_MS` (10 min). Fixed, regression-tested, verified live on prod.
  Full writeup: `docs/ai/known-fixes.md`; golden rule added.
- `deploy-vps.yml`/`deploy-vps-staging.yml` wired up and verified end-to-end
  for the first time (previously prod was deployed by hand).
- Full audit fixed: unenforced CPU limits under plain `docker compose`,
  OAuth CSRF, missing upload rate limit, a `morgan` CVE, unpinned GH
  Actions, added space-preview thumbnailing + spaces pagination.
- `release.json` baked into the server image so `/api/health` self-reports
  `deployEnv`/`gitCommit`.
- **Caused a brief prod outage**: bad `client`/`caddy` healthcheck stalled
  Caddy's startup dependency. Reverted (`c90f1a65`), redeployed, confirmed
  clean. See Open below — don't re-add without testing the exact command.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected login) + open-space/sandbox implicit grants
- Production + staging both live on the VPS (Docker/Caddy), both deploy via
  `git push origin main`/`dev` — verified working end-to-end, release.json included.

## Open

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
