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
docs/deploy/                      ← deployment documentation (canonical: LIVE_DEPLOY.md)
scripts/                          ← automation and release helpers
docker-compose*.yml               ← Compose stack definitions (base + prod/staging/caddy overrides)
```

**There is no PM2.** Process supervision is Docker Compose (`restart:` policy), not a process
manager. A `serverXR/ecosystem.config.js` file still exists, but it is dead weight referenced
only by the legacy cPanel staging script (`scripts/stage-cpanel-nodeapp-release.mjs`) — it is
not part of any live deploy path. Do not add process-manager config to a task.

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

**Canonical doc: `docs/deploy/LIVE_DEPLOY.md`.** When this card and that doc disagree, that doc
wins — read it before any deploy work.

Production DNS (`di-studio.xyz`) is fully cut over to a **Hetzner VPS running Docker + Caddy**.
cPanel has been legacy fallback only since 2026-07-15 (see below) — do not treat it as the live path.

**The deploy pipeline is wired up and verified (2026-07-16).** Both `deploy-vps.yml` (production,
push to `main`) and `deploy-vps-staging.yml` (staging, push to `dev`) have had real, successful
end-to-end runs — GitHub secrets/variables are set (`VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY`,
`VPS_DEPLOY_PATH`, `VPS_STAGING_DEPLOY_PATH`, `REGISTRY_USER`, `VPS_BASE_URL`,
`VPS_STAGING_BASE_URL`). Both workflows `git checkout <deployed-sha> -- <tracked compose/Caddy
files>` before restarting the stack, so config drift on the host is caught automatically, not
just image updates.

**`/api/health` now tells you what is actually running** (this card previously said no
git-commit stamp existed — that is out of date). `serverXR/Dockerfile` bakes a `release.json`
into the image, `serverXR/src/releaseInfo.js` loads it, and `statusRoutes.js` exposes
`release: { deployEnv, sourceRef, gitCommit, releaseId, generatedAt }`. Verify a deploy by
comparing `release.gitCommit` against the workflow run's `head_sha`:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health   # or di-studio.xyz for prod
gh run list --workflow=deploy-vps.yml --limit 1
```

Note the asymmetry: `release.json` is baked by **serverXR's Dockerfile only** — the client
image does not carry one. A `null` `gitCommit` means the file was missing at build time, which
is itself a finding, not a reason to go back to guessing from run logs.

### Frontend + Backend (VPS, Docker Compose)

- **Hosting:** Hetzner VPS (~2 vCPU / 4GB), Docker Compose stack: `client` (nginx serving Vite's
  `dist/`), `server` (Node/Express), `caddy` (TLS termination + reverse proxy, `profile: https`).
- **Deploy trigger:** push to `main` → `.github/workflows/deploy-vps.yml` builds `dii-server`/
  `dii-client` images, pushes to GHCR, SSHes into the VPS, syncs tracked config, `docker compose
  pull && up -d`, reloads Caddy.
- **Staging:** push to `dev` → `deploy-vps-staging.yml` — same VPS, a separate low-resource
  Compose project (`docker-compose.staging.yml`) in its own checkout dir (`/opt/di.iiii-staging`),
  fronted by production's Caddy via a second site block at `staging.di-studio.xyz`.
- **Data:** a mounted `/data` volume — SQLite DB + `spaces/` directory with binary assets.
- **Config:** `docker-compose.yml` (base) + `docker-compose.prod.yml` (pull-from-GHCR override) +
  `docker-compose.caddy-hardened.yml` (production only — resets the client's published port so
  Caddy is the only way in) + `docker-compose.staging.yml` (staging override). CPU/memory `limits`
  are set per-service but oversubscribe the 2 vCPU host once staging is running alongside prod
  (see audit notes) — check actual host specs before raising any service's ceiling.

### cPanel — Legacy Fallback (disabled since 2026-07-15)

Kept only until its hosting term expires; do not build new deploy work against it.

- `publish-cpanel-prebuilt-v2.yml` is `workflow_dispatch`-only (no longer triggers on push),
  and its smoke check **fails on every run**. A red run on that workflow is the expected state,
  not an incident — do not "fix" it, and do not treat it as evidence that prod is broken.
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

There are exactly two source branches. **There is no `staging` branch** — "staging" is an
environment (`staging.di-studio.xyz`), deployed from `dev`. If a task says "push to staging",
it means push to `dev`.

- Routine feature work: start on `dev`
- Production deploy: merge `dev` into `main` and push — triggers `deploy-vps.yml`
- Staging deploy: push to `dev` — triggers `deploy-vps-staging.yml`
- Emergency hotfix only: work directly on `main`
- Note: `main` currently has a "changes must go through a PR" branch protection rule that direct
  pushes bypass with an admin warning — a real PR flow for `main` is still an open item, not yet
  the enforced norm

---

## GitHub Actions Patterns

### VPS Deploy Workflows (live, verified)

`deploy-vps.yml` (production, push to `main`) and `deploy-vps-staging.yml` (staging, push to
`dev`) both: build+push images to GHCR, SSH into the VPS, `docker compose pull && up -d`, then
run `scripts/smoke-check.mjs` (shared smoke check, renamed from `smoke-check-cpanel.mjs` since
it was never cPanel-specific) against the deployed host.

Required GitHub secrets/variables: see `docs/deploy/VPS_DOCKER_DEPLOY.md`.

**Deploy gates — a stalled deploy is usually one of these, not a broken workflow:**
- Production `deploy` waits for a manual approval. A run sitting in `waiting` is blocked on
  that approval; `waiting` is not `queued`.
- A leftover session note committed on `dev` silently **skips** the staging deploy. If a push
  to `dev` produced no staging deploy, check for that before debugging the workflow.

### Never in CI

- Commit secrets or `.env` files
- Run `npm run test:server-contracts` without a real SQLite database available
- Push to `main` automatically without a manual approval step for production changes

---

## Scripts — What's Available

```
scripts/capture-rule.sh           ← add a golden rule mid-session
scripts/golden-rules-check.sh     ← check if a rule needs to be added
scripts/smoke-check.mjs           ← post-deploy smoke check (also run by both VPS workflows)
npm run docs:ai:sync              ← sync AI doc bridges after canonical doc changes
npm run docs:ai:check             ← verify bridge files match canonical docs
npm run deploy:status             ← current deploy state
npm run smoke                     ← smoke check against a host
```

Run `npm run` with no arguments for the full list before assuming a helper does not exist.

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
