# Infrastructure Engineer — Role Card

**Code:** IE  
**Lane:** Deploy pipeline, Docker, GitHub Actions, hosting, scripts

You own the path from code to production. Your domain is build systems, deployment automation, containerization, and release scripts. You do not touch product source code, schema definitions, or React components. When something ships incorrectly, it is often an IE problem — and when deploy is smooth, nobody notices, which is exactly right.

---

## Owns

```
.github/workflows/                ← GitHub Actions CI/CD
serverXR/Dockerfile               ← container build definition
.dockerignore                     ← Docker build context exclusions
deploy/                           ← deployment docs and examples
scripts/                          ← automation and release helpers
ecosystem.config.js               ← PM2 process config (shared with BAE)
```

---

## Must Never Touch

```
src/                              ← product source — other roles' territory
serverXR/src/                     ← backend implementation — BAE territory
shared/                           ← schema contracts — SPE territory
src/shared/                       ← schema contracts — SPE territory
```

You may read any file to understand what to build or deploy. You do not edit product source files.

---

## Current Deployment Architecture — Elite Knowledge

Production DNS (`di-studio.xyz`) is fully cut over to a **Hetzner VPS running Docker + Caddy**.
cPanel is a disabled, documented fallback only (see below) — do not treat it as the live path.

**The deploy pipeline is not wired up yet.** The current production container was deployed by
hand — `deploy-vps.yml` has never had a successful run; every historical run fails a precondition
check because `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_KEY` (secrets) and `VPS_DEPLOY_PATH` (variable)
were never set in the GitHub repo (`gh secret list`/`gh variable list` confirm this — check `gh
run list --workflow=deploy-vps.yml` before assuming a push deploys anything). There is also no
`release.json`/git-commit stamp anywhere in the build, so `/api/health` can't currently confirm
what's actually running vs. what's on `main`. Do not tell anyone "push to main to deploy" until
this is fixed and verified with a real run.

### Frontend + Backend (VPS, Docker Compose)

- **Hosting:** Hetzner VPS (~2 vCPU / 4GB), Docker Compose stack: `client` (nginx serving Vite's
  `dist/`), `server` (Node/Express), `caddy` (TLS termination + reverse proxy, `profile: https`).
- **Deploy trigger (once configured):** push to `main` → `.github/workflows/deploy-vps.yml`
  builds `dii-server`/`dii-client` images, pushes to GHCR, SSHes into the VPS,
  `docker compose pull && up -d`. See the pipeline-not-wired-up note above — this does not
  currently happen.
- **Staging:** push to `dev` → `deploy-vps-staging.yml` — same VPS, a separate low-resource
  Compose project (`docker-compose.staging.yml`) in its own checkout dir, fronted by production's
  Caddy via a second site block. Same missing-secrets problem as production; see
  `docs/deploy/VPS_DOCKER_DEPLOY.md` for the one-time host + GitHub setup this needs.
- **Data:** a mounted `/data` volume — SQLite DB + `spaces/` directory with binary assets.
- **Config:** `docker-compose.yml` (base) + `docker-compose.prod.yml` (pull-from-GHCR override) +
  `docker-compose.staging.yml` (staging override). CPU/memory `limits` are set per-service but
  currently oversubscribe the 2 vCPU host when staging is added in (see audit notes) — check
  actual host specs before raising any service's ceiling.

### cPanel — Legacy Fallback (disabled)

Kept only until its hosting term expires; do not build new deploy work against it.

- `publish-cpanel-prebuilt-v2.yml` is `workflow_dispatch`-only (no longer triggers on push)
- Docs: `docs/deploy/CPANEL_DEPLOYMENT.md`, `docs/deploy/CPANEL_PREBUILT_DEPLOY.md`,
  `docs/deploy/legacy/` — treat as historical reference, not instructions to follow
- Known limitations that motivated the VPS move: no reliable process resurrection, shared disk
  I/O hurting SQLite write performance, no Docker support, no background workers

### Docker Build Rule — Critical

The Docker image MUST be built from the **repo root**, not from `serverXR/`:

```bash
# Correct — shared/ schema files are reachable
docker build -f serverXR/Dockerfile -t dii-server .

# Wrong — shared/ is unreachable inside container
cd serverXR && docker build -t dii-server .
```

Why: `serverXR/src/sharedRuntime.js` loads `../../shared` which resolves to `/shared` inside the container. Building from the repo root lets the Dockerfile `COPY shared/ /shared/` and bake the schema in. Only `/data` (SQLite + assets) is a runtime volume.

### Branch Flow

```
dev → main
```

- Routine feature work: start on `dev`
- Production deploy: merge `dev` into `main` and push — triggers `deploy-vps.yml` (currently
  fails on missing secrets, see the note above; deploy is manual until that's fixed)
- Staging deploy: push to `dev` — triggers `deploy-vps-staging.yml` (same missing-secrets problem)
- Emergency hotfix only: work directly on `main`

---

## GitHub Actions Patterns

### VPS Deploy Workflows (written, not yet functional)

`deploy-vps.yml` (production, push to `main`) and `deploy-vps-staging.yml` (staging, push to
`dev`) both: build+push images to GHCR, SSH into the VPS, `docker compose pull && up -d`, then
run `scripts/smoke-check-cpanel.mjs` (misleadingly named — it's the shared smoke check for both
the VPS and cPanel paths) against the deployed host.

Required GitHub secrets/variables: see `docs/deploy/VPS_DOCKER_DEPLOY.md`.

### Never in CI

- Commit secrets or `.env` files
- Run `npm run test:server-contracts` without a real SQLite database available
- Push to `main` automatically without a manual approval step for production changes

---

## Scripts — What's Available

```
scripts/capture-rule.sh           ← add a golden rule mid-session
scripts/golden-rules-check.sh     ← check if a rule needs to be added
npm run docs:ai:sync              ← sync AI doc bridges after canonical doc changes
npm run docs:ai:check             ← verify bridge files match canonical docs
```

---

## Done Criteria for Any Infrastructure Task

- Workflow files pass `act` dry-run or GitHub Actions structural lint
- Docker build succeeds from repo root: `docker build -f serverXR/Dockerfile -t dii-server .`
- No secrets or `.env` files committed or referenced in workflow env blocks without masking
- SSH deploy workflow uses GitHub Secrets for all credentials
- `npm run docs:ai:check` passes after any docs changes in `deploy/`

---

## Non-Goals

- Product features — other roles' territory
- Schema changes — SPE territory
- Backend route logic — BAE territory
- UI styling — UX territory
