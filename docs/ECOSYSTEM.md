# di.iiii Ecosystem Map

This document describes the full system: what exists, how the parts relate, and who owns what.

## Overview

```
di.iiii platform  (dob-0/di.iiii)
├── Studio          main shipped authoring lane
├── Beta            experimental node-graph editor
├── V1              legacy fallback lane
├── serverXR        Node/Express backend — auth, persistence, publish state
└── spaces/         content hosted on the platform

Spaces hosted on di-studio.xyz:
├── n000            default onboarding space
├── br_id_ge        tele-symbiotic XR performance prototype  (dob-0/br_id_ge)
└── wcc             World Creative Commons  (Emilya's wcc-space branch)

Support tools:
└── _ii             live terminal VJ visual engine for br_id_ge shows  (dob-0/_ii)
```

## Repositories

| Repo | Purpose | Stack | Branch |
|------|---------|-------|--------|
| `dob-0/di.iiii` | Platform, editor, serverXR | React 18 + Three.js + R3F + Node/Express + SQLite | `dev → staging → main` |
| `dob-0/br_id_ge` | Performance prototype, GitHub Pages site | Vanilla JS + Three.js (index.html SPA) + Node ws | `main` |
| `dob-0/_ii` | Live terminal VJ engine | Python 3 + curses | `main` |
| `emilyanikoghosyan/di.iiii` | WCC fork; `wcc-space` branch | Same as di.iiii | `wcc-space` (79 commits ahead of main as of June 2026) |

## Data flow

```
Creator browser (Studio/Beta)
    ↕ session cookie auth
    ↕ REST + Socket.IO
serverXR (port 4000 in dev, /serverXR proxy in prod)
    ↕ SQLite (di.db)
    ↕ file system (serverXR/data/spaces/)
    ↕ op-log (append-only CRDT)
GitHub Actions → cPanel deploy → di-studio.xyz
```

br_id_ge WebSocket mesh (`serverXR/wsMesh.js`) is a separate Node process — it does NOT share serverXR's auth or database. It runs standalone for performances.

_ii communicates with its own Debian machine via SSH (`scripts/sync.sh`). No connection to di.iiii's serverXR.

## Sync relationships

| Source | Target | Mechanism |
|--------|--------|-----------|
| di.iiii `src/` | di.iiii `dist/` | `npm run build` (Vite) |
| di.iiii `DEVELOPMENT.md`, `index.html`, `docs/PROJECT.md` | br_id_ge repo | `npm run sync:public:br_id_ge` → `scripts/sync-public-br-id-ge.mjs` |
| di.iiii `AGENTS.md` | `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/*.mdc` | `npm run docs:ai:sync` (auto-runs via PostToolUse hook) |
| br_id_ge `main` | GitHub Pages (`dob-0.github.io/br_id_ge/`) | `.github/workflows/pages.yml` on push |
| WCC `wcc-space` | di.iiii `main` | Not yet merged (see `docs/WCC_MERGE_PLAN.md`) |

## Canonical sources

| Thing | Canonical location | Do not duplicate in |
|-------|-------------------|---------------------|
| Project schema | `src/shared/projectSchema.js` (ESM) + `shared/projectSchema.cjs` (CJS mirror) | Any lane, serverXR direct parse |
| Auth / session | `serverXR/src/` | JS bundle, VITE_ env vars |
| Op-log | append-only in SQLite | Client rewrites, server mutations |
| AI routing docs | `AGENTS.md` (root + per-scope) | `CLAUDE.md`, `GEMINI.md`, Cursor rules (generated) |
| br_id_ge project docs | `br_id_ge/docs/PROJECT.md` | Synced from di.iiii, do not edit in br_id_ge directly |

## Key invariants

- **No tokens in the JS bundle.** Auth is session cookies + server env vars only.
- **Op-log is append-only.** Never rewrite or server-side mutate.
- **Schema is dual-file.** `src/shared/projectSchema.js` and `shared/projectSchema.cjs` must stay in lockstep. Mismatch = 503 on deploy.
- **three-vendor chunk is manual.** Every npm package that imports `three` must be listed in `vite.config.js` `manualChunks`. Missing one = TDZ crash in production (invisible in dev).
- **Studio is the main lane.** Beta is experimental. V1 is legacy fallback only.

## Pending integration points

- `_ii` web portal (port 7777) could be embedded in di.iiii as a space panel — no work started.
- WCC merge plan: `docs/WCC_MERGE_PLAN.md`
- br_id_ge `serverXR/wsMesh.js` is auth-gated (`ROOM_SECRET` env var) but has no persistence layer or clustering.
