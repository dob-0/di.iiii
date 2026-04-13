# dii Scene Editor

Spatial editor for the web (React + Vite) with an optional Node API (`serverXR/`) for sharing scenes and assets.

## Requirements
- Node 18+ (frontend) / Node 18+ or host-provided version for `serverXR` (ecosystem config targets 22.x).
- npm

## Repo Layout
- `/` – React app (UI/editor).
- `/serverXR` – Express API for spaces/scenes/assets (optional but recommended in production).
- `/dist` – Built front-end (after `npm run build`).

## Front-end: Local Dev
```bash
npm install
npm run dev   # http://localhost:5173
```

## Front-end: Build for Prod
```bash
npm run build         # emits dist/
```
Deploy `dist/` to any static host. If you serve the API under `/serverXR`, set the build-time env so the UI calls the right origin:
```bash
VITE_API_BASE_URL=https://your-domain/serverXR npm run build
```

## ServerXR API (local/manual)
```bash
cd serverXR
cp .env.example .env   # adjust PORT/APP_BASE_PATH/DATA_ROOT as needed
npm install
npm run dev            # or: node src/index.js (uses PORT from .env, default 4000)
```
Key envs (see `serverXR/.env.example`):
- `PORT` (default 4000)
- `APP_BASE_PATH` (e.g. `/serverXR` when behind a proxy)
- `DATA_ROOT` (where spaces/uploads are stored; default `./data`)

## ServerXR with PM2 (recommended)
From `/serverXR`:
```bash
npm install --production
pm2 start ecosystem.config.js   # starts app name dii-control-server
pm2 logs dii-control-server
pm2 restart dii-control-server
pm2 save                        # optional: keep on reboot if startup scripts are enabled
```

## Deploying
1) **Front-end**
   - Build: `npm run build`
   - Upload `dist/` to your web root.
   - Ensure `VITE_API_BASE_URL` at build time points to your API base (or leave empty for local-only).

2) **ServerXR**
   - Upload `/serverXR` to the server (e.g. `/home/<user>/serverXR`).
   - `cp .env.example .env` and set `PORT`, `APP_BASE_PATH=/serverXR` (if reverse-proxied), `DATA_ROOT` as needed.
   - `npm install --production`
   - `pm2 start ecosystem.config.js`
   - If using nginx/Apache, proxy `/serverXR` to `http://127.0.0.1:<PORT>` and allow CORS from your front-end origin.

## Common URLs (when APP_BASE_PATH=/serverXR)
- Status page: `/serverXR/`
- Health: `/serverXR/api/health`
- Spaces API: `/serverXR/api/spaces`
- Assets: `/serverXR/api/spaces/:id/assets/:assetId`

## Troubleshooting
- **503 / CORS from /api/spaces**: serverXR not running or blocked by proxy/CORS. Start the service (`pm2 start ecosystem.config.js`) and allow CORS for your front-end origin.
- **PM2 restarts repeatedly**: check `serverXR/stderr.log` and `pm2 logs dii-control-server` for the actual error (port in use, missing env, bad path).
- **Gizmo arrows misaligned**: ensure the UI build is up to date (local-space gizmo is the current behavior).

## Shortcuts (UI)
- Toggle HUD: `H`
- Gizmo modes: `G` / `R` / `S`; axis locks `X`/`Y`/`Z`
- Selection: click, Shift-click to add/remove; Delete/Backspace to remove objects
