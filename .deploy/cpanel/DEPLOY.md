# cPanel Release Bundle

Build the staged release with:

```bash
npm run deploy:cpanel
```

That command creates:

```text
.deploy/cpanel/
├── public_html/
├── serverXR/
├── shared/
├── frontend.env.production.example
├── DEPLOY.md
└── release.json
```

## Upload Targets

- Sync `.deploy/cpanel/public_html/` into your domain web root such as `public_html/`
- Sync `.deploy/cpanel/serverXR/` into your Node.js app root such as `~/serverXR/`
- Sync `.deploy/cpanel/shared/` into a sibling folder such as `~/shared/`

The `shared/` folder is required because `serverXR/src` imports the shared schemas from `../../shared`.

## Important Change

- Do not upload a `public_html/serverXR/` proxy folder.
- In the current deployment model, cPanel `Setup Node.js App` owns `/serverXR`.
- The release bundle intentionally removes the legacy Apache proxy files from `public_html/`.

## First-Time Server Setup

1. Create a Node.js app in cPanel:
   - app root: `serverXR`
   - app URL: `/serverXR`
   - startup file: `src/index.js`
2. Copy `serverXR/.env.production.example` to `serverXR/.env` and replace placeholders.
3. Install production dependencies in the app root:

```bash
cd ~/serverXR
npm install --production
cloudlinux-selector restart --json --interpreter nodejs --user "$USER" --app-root serverXR
```

## Verify

- Frontend: `https://your-domain/`
- Admin: `https://your-domain/admin?space=main`
- Server status: `https://your-domain/serverXR/`
- Health: `https://your-domain/serverXR/api/health`
- Events: `https://your-domain/serverXR/api/events`

## Compatibility Guardrails (cPanel)

cPanel environments are sensitive to native Node modules (binary addons).

- Avoid native dependencies in `serverXR/package.json` for cPanel deploy branches.
- In particular, do not introduce `better-sqlite3` on cPanel targets.
- The GitHub workflow `publish-cpanel-prebuilt-v2.yml` runs `scripts/check-cpanel-compat.mjs` and blocks incompatible releases.

## Update Checklist (Staging)

```bash
cd ~/repositories/di.iiii-staging
git fetch --prune origin
git checkout cpanel-staging
git pull --ff-only origin cpanel-staging
bash scripts/cpanel-apply-prebuilt-release.sh staging
curl -sS -i --max-time 20 https://staging.di-studio.xyz/serverXR/api/health | head -n 30
```

If `cpanel-poll-deploy.sh` reports `already up to date`, it will not apply by default.

- Run `bash scripts/cpanel-apply-prebuilt-release.sh staging` to force apply.
- Or set `CPANEL_APPLY_WHEN_UPTODATE=1` before running poll.
