# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `b3a404df` — Spaces Grid/Map toggle (`SpaceConstellation.jsx`,
force-laid graph view) + the 16-bug deep-audit fix set (below), live on
staging. Before that: `ae64428c` hide `[archived]`-titled projects from
the Studio project grid by default (#48, merged in ahead of this commit),
`dcffff0f` WebGL context-loss recovery. `main` = `a70da5d9` — prod green:
admin delete for open-call applications; before that same day: direct
project links `/:space/p/:projectId`; open inscriptions, public CORS,
invite links (#44), WCC walker fix (#46).

## Last session (2026-07-14 — deep audit + staging deploy revival + VPS scoping)

- Full-codebase audit: 7-agent parallel find + 2x adversarial verify, 26 raw →
  16 confirmed bugs, 2 critical (`/api/sync/spaces/:id/*` had zero per-space
  auth scope; every Beta window's drag/resize was silently dead) — full list
  in [known-fixes.md](docs/ai/known-fixes.md)'s last row.
- Staging had been stuck 3+ weeks (deploys fetched but never applied): root
  cause was the cPanel account's 2GB LVE memory cap fully maxed out, blocking
  all `fork()` (deploy cron, `ps`, everything) — not a stale key. Fixed by
  restarting the Node.js apps in cPanel's Setup Node.js App; confirmed via
  `FORK_OK` test and a clean auto-deploy cron log afterward. Removed a
  duplicate staging cron entry created mid-investigation.
- Manually deployed the backlog (`Deploy HEAD Commit` in cPanel Git Version
  Control) — staging now live at `4d59e839`, auto-deploy cron confirmed
  healthy again.
- Scoped a VPS migration off cPanel (Hetzner CPX21 + Docker, Cloudflare
  Tunnel profile for zero-cert-hassle TLS) to escape cPanel's opaque LVE
  limits long-term. Found the repo already has a full working Docker setup
  (`Dockerfile`, `serverXR/Dockerfile`, `docker-compose.yml` incl. a
  `tunnel` profile, `docker-compose.prod.yml`, space export/import bundles)
  — untested by CI and not build-verified this session (no Docker on this
  machine). Also recovered `deploy-staging-ssh.yml` from git history
  (deleted 2026-06-16, "no SSH secrets") as reusable raw material if a
  push-deploy path is wanted later instead of the Docker/cron pull model.
- Ruled out ANSCC (Armenian National Supercomputing Center) as a hosting
  target — it's a peer-reviewed scientific-compute grant program, not
  hosting; only worth revisiting if `br_id_ge` gets framed as an actual
  research/heritage project, not as free infra for the commercial platform.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links + open inscriptions + public CORS; deploy: `dev`→staging, `main`→prod
- Staging auto-deploy cron (2-min poll) confirmed healthy again as of tonight

## Open

- VPS migration decision pending: user renting a Hetzner VPS; keep cPanel as
  fallback until it expires. Next step once VPS exists: install Docker,
  `docker compose --profile tunnel up --build -d`, verify the existing
  compose stack actually works end-to-end (never build-tested).
- If VPS/Docker memory ever creeps toward its cap again, same fix as this
  session: cPanel/host process manager → restart the Node app(s).
- ANSCC research-grant angle for `br_id_ge` — user wants ~1 month before
  writing an actual research case, if pursued at all.
- Real-device click-through owed: staging (guest journey + invite flow) +
  previous UX slices (on prod). Old guest cookies keep `main` in scope ≤30d.
- Drive Picker blocked on Cloud console. Stale GitHub App key in
  `serverXR/.env.local`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
