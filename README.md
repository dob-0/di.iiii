# dii Scene Editor

Web-based spatial editor built with React, Vite, Three.js, and an optional Node backend in [serverXR](./serverXR).

This repo currently includes two editors:

- `V1` legacy space editor on routes like `/main`
- `V2` hidden beta desktop editor on `/beta`

## What This Repo Contains

- `src/` - frontend app
- `src/beta/` - V2 hidden beta editor
- `serverXR/` - Node/Express backend for spaces, projects, assets, ops, SSE, and Socket.IO presence
- `shared/` - schemas shared by frontend and backend
- `public/` - static files and Apache helpers
- `docs/` - deployment and testing notes

## Requirements

- Node 18+
- npm

## Local Development

Install dependencies:

```bash
npm install
cd serverXR && npm install
```

Run the full local stack from the repo root:

```bash
npm run dev
```

That command:

- starts `serverXR` automatically when needed
- points the frontend at `http://localhost:4000/serverXR`
- launches Vite

Useful local URLs:

- `http://localhost:5173/main` - legacy editor
- `http://localhost:5173/beta` - hidden beta hub
- `http://localhost:4000/serverXR/api/health` - backend health

Other scripts:

```bash
npm run dev:client
npm run dev:server
npm run build
npm run test
npm run lint
```

## Editors

### Legacy Editor (V1)

The legacy editor is space-based.

Examples:

- `/main`
- `/my-space`

V1 supports primitives, text, media objects, transform gizmos, multi-selection, XR entry points, local persistence, and server-backed collaboration.

### Hidden Beta (V2)

Open `/beta`.

V2 is a separate editor model with:

- hub-first entry
- project-based workflow
- desktop-window layout
- generic property-sheet inspector
- asset-first workflow
- one-way import from local V1 scene files

V2 is still beta and lives beside V1, not in place of it.

## Collaboration Model

### V1

- `spaces` are the shared unit
- durable scene ops are authoritative
- SSE is used for sync/catch-up
- Socket.IO is used for presence only

### V2

- `projects` are the editable unit inside a space
- durable project ops are authoritative
- SSE carries document updates
- Socket.IO is used for roster and cursors only

## ServerXR

`serverXR` handles:

- spaces
- scenes
- V2 projects
- assets
- ops history
- SSE streams
- Socket.IO presence/cursors
- auth and edit locks

Run it manually if needed:

```bash
cd serverXR
cp .env.example .env
npm install
npm run dev
```

Important environment variables:

- `PORT`
- `APP_BASE_PATH`
- `DATA_ROOT`
- `API_TOKEN`
- `REQUIRE_AUTH`
- `CORS_ORIGINS`
- `MAX_UPLOAD_MB`

Typical local dev CORS:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

More backend detail lives in [serverXR/README.md](/home/nnn/Desktop/dii_ii/serverXR/README.md).

## Production Build

Build the frontend:

```bash
npm run build
```

If you need a cPanel-ready bundle:

```bash
npm run deploy:cpanel
```

That creates a staged release bundle in `.deploy/cpanel/` with:

- `public_html/`
- `serverXR/`
- `shared/`

The PowerShell helper [build-for-cpanel.ps1](/home/nnn/Desktop/dii_ii/build-for-cpanel.ps1) runs the same staging flow on Windows.

## Testing

Run the main checks:

```bash
npm test
npm run build
npm run lint
```

The repo includes coverage for:

- editor state
- collaboration contracts
- backend auth and read-only enforcement
- V2 project APIs
- V2 routing and layout behavior

## Troubleshooting

### Frontend loads but server calls fail

Check:

- `http://localhost:4000/serverXR/api/health` locally
- `https://your-domain/serverXR/api/health` in production
- `VITE_API_BASE_URL`
- `CORS_ORIGINS`

### Beta page opens but shows project load errors

That usually means the frontend is newer than the live backend. Update `serverXR/`, `shared/`, and restart the public backend.

### Firefox shows SES warnings

Those messages usually come from a browser extension, not this app.

### Video does not autoplay

Firefox private browsing and some browser policies may require a click or key press before playback starts.

## Legacy Editor Shortcuts

- `H` - toggle UI
- `G` - move
- `R` - rotate
- `S` - scale
- `X / Y / Z` - axis lock
- `Delete / Backspace` - delete selected
- `Ctrl/Cmd + Z` - undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` - redo

## Notes

- `V1` remains the main stable editor path
- `V2` is the active hidden beta
- generated build/deploy artifacts are intentionally not kept as source
