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
