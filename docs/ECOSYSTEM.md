# di.iiii Ecosystem Map

This document describes the full system: what exists, how the parts relate, and who owns what.

## Overview

```
di.iiii platform  (dob-0/di.iiii)
├── Studio          main shipped authoring lane
├── Raw             experimental node-first lane (absorbed Beta, retired 2026-08-06)
├── V1              legacy fallback lane
├── serverXR        Node/Express backend — auth, persistence, publish state, realtime
└── spaces/         content hosted on the platform

Spaces live on di-studio.xyz (queried prod 2026-08-10):
├── main            default space
├── br-id-ge        tele-symbiotic XR performance  (linked repo dob-0/br_id_ge)
├── wcc             World Creative Commons  (public landing → live scene, src/wcc/)
├── beyond-form     Gyumri Art Week exhibition page
├── platform-recordar  RecordAR landing
├── azd · algovrithm · open

Support tools:
└── _ii             live terminal VJ visual engine for br_id_ge shows  (dob-0/_ii)
```

## Repositories

| Repo | Purpose | Stack | Branch |
|------|---------|-------|--------|
| `dob-0/di.iiii` | Platform, editor, serverXR | React 18 + Three.js + R3F + Node/Express + SQLite (`node:sqlite`) | `dev → main` |
| `dob-0/br_id_ge` | Performance prototype, GitHub Pages site | Vanilla JS + Three.js (index.html SPA) + Node ws | `main` |
| `dob-0/_ii` | Live terminal VJ engine | Python 3 + curses | `main` |
| `emilyanikoghosyan/di.iiii` | WCC fork (contributes via task branches → auto-PR to upstream `dev`) | Same as di.iiii | task branches |

## Data flow

```
Creator browser (Studio/Raw)
    ↕ session cookie auth
    ↕ REST + Socket.IO
serverXR (port 4000 in dev, /serverXR proxy in prod)
    ↕ SQLite (di.db)
    ↕ file system (serverXR/data/spaces/)
    ↕ op-log (append-only CRDT)
GitHub Actions → Hetzner VPS (Docker Compose behind Caddy)
    dev  → staging.di-studio.xyz   (deploy-vps-staging.yml)
    main → di-studio.xyz           (deploy-vps.yml)
```

Deploy truth: [docs/deploy/LIVE_DEPLOY.md](deploy/LIVE_DEPLOY.md) (production moved off cPanel to the VPS 2026-07-15).

The live co-presence mesh (`serverXR/src/meshHub.js`) is NOT a separate process — it is a raw WebSocket hub attached to serverXR's own HTTP server, on its own path (`<basePath>/mesh`) beside Socket.IO. It is open/anonymous by default with abuse caps; protected node ids (`keeper-*`) require `MESH_ROOM_SECRET`. It has no persistence layer.

_ii communicates with its own Debian machine via SSH (`scripts/sync.sh`). No connection to di.iiii's serverXR.

## Sync relationships

| Source | Target | Mechanism |
|--------|--------|-----------|
| di.iiii `src/` | di.iiii `dist/` | `npm run build` (Vite) |
| di.iiii `AGENTS.md` | `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/*.mdc` | `npm run docs:ai:sync` (auto-runs via PostToolUse hook) |
| br_id_ge `main` | GitHub Pages (`dob-0.github.io/br_id_ge/`) | `.github/workflows/pages.yml` on push |
| WCC public page | di.iiii `src/wcc/` | Shipped — per-space `isPublic` flag + in-repo scene (see `docs/WCC_MERGE_PLAN.md`) |

## Canonical sources

| Thing | Canonical location | Do not duplicate in |
|-------|-------------------|---------------------|
| Project schema | `src/shared/projectSchema.js` (ESM) + `shared/projectSchema.cjs` (CJS mirror) | Any lane, serverXR direct parse |
| Auth / session | `serverXR/src/` | JS bundle, VITE_ env vars |
| Op-log | append-only in SQLite | Client rewrites, server mutations |
| AI routing docs | `AGENTS.md` (root + per-scope) | `CLAUDE.md`, `GEMINI.md`, Cursor rules (generated) |
| br_id_ge project docs | `br_id_ge/docs/PROJECT.md` | Synced from di.iiii, do not edit in br_id_ge directly |
| Machines / infrastructure | private `dob-0/di-atlas` (`machines/`, incl. the `asuz` Debian box added 2026-08-13) | This file, memory |

## Key invariants

- **No tokens in the JS bundle.** Auth is session cookies + server env vars only.
- **Op-log is append-only.** Never rewrite or server-side mutate.
- **Schema is dual-file.** `src/shared/projectSchema.js` and `shared/projectSchema.cjs` must stay in lockstep. Mismatch = 503 on deploy.
- **three-vendor chunk is manual.** Every npm package that imports `three` must be listed in `vite.config.js` `manualChunks`. Missing one = TDZ crash in production (invisible in dev).
- **Studio is the main lane.** Raw is experimental (Beta retired 2026-08-06, absorbed into Raw). V1 is legacy fallback only.

## Pending integration points

- `_ii` web portal (port 7777) could be embedded in di.iiii as a space panel — no work started.
- WCC merge plan: `docs/WCC_MERGE_PLAN.md`
- The co-presence mesh (`serverXR/src/meshHub.js`) gates only `keeper-*` node ids (`MESH_ROOM_SECRET`) and has no persistence layer or clustering.
