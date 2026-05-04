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

### Frontend

- **Hosting:** cPanel `public_html` (static files)
- **Deploy trigger:** cron job pulls prebuilt GitHub branch every few minutes
- **Build:** Vite — output is `dist/`

### Backend

- **Hosting:** cPanel Node.js App at `/serverXR`
- **Process manager:** PM2 via `ecosystem.config.js`
- **Deploy trigger:** same cron model as frontend
- **Data:** `serverXR/data/` — SQLite DB + `spaces/` directory with binary assets

### cPanel Limitations (known)

- No reliable process resurrection — PM2 restarts are controlled by cPanel, not us
- Shared disk I/O affects SQLite write performance under load
- No Docker support
- No background workers
- Awkward deploy: prebuilt-branch model

### Target Infrastructure: Hetzner CX22

- ~€4/mo: 2 vCPU, 4GB RAM, 40GB SSD
- PM2 for process management
- Nginx reverse proxy
- GitHub Actions: push to `staging` → build → SSH rsync → restart PM2
- SQLite and assets on a mounted volume

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
dev → staging → main
```

- Routine feature work: start on `dev`
- Staging deploy: `staging` branch
- Production deploy: `main` branch
- Emergency hotfix only: work directly on `main`

The cPanel cron deploys `main` to production and `staging` to the staging environment.

---

## GitHub Actions Patterns

### SSH Deploy Workflow (opt-in, for VPS)

Trigger: push to `staging` or manual dispatch.

Steps:
1. Checkout repo
2. Build frontend (`npm ci && npm run build`)
3. rsync `dist/` to VPS public directory
4. rsync `serverXR/` to VPS app directory
5. SSH restart: `pm2 reload dii-server`

Required GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`.

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
