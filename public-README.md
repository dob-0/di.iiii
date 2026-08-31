# di.iiii

**Web XR Node-Based Reality Creation Language**

*Web XR Spatial-Sync Creator Network*

`di.iiii` is an open-source, node-based Web XR reality creation system. It behaves like a visual programming language for linking digital logic, spatial media, and real environments through authored nodes, shared spaces, and live projects. Built on the web as a serious medium and universal substrate, not as a browser-only limitation.

## Live

[di-studio.xyz](https://di-studio.xyz)

## What di.iiii is

- **As software** — a web-based authoring system built with React, Vite, Three.js, WebXR, and a Node.js backend (`serverXR`). SQLite via the built-in `node:sqlite` module — zero native deps.
- **As a model** — treats authored reality as a graph of nodes, projects, assets, and runtime relationships
- **As a direction** — aims toward broader reality creation across virtual and physical environments, while staying grounded in the web as an everywhere layer
- **As a working repo** — contains Studio, the node editor, the older editor kept for compatibility, and the backend/runtime contract that holds them together

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Three.js, React Three Fiber, WebXR |
| Backend | Node.js, Express, Socket.IO, SQLite (`node:sqlite`) (`serverXR/`) |
| Shared | JSON schema contracts (`shared/`) |
| Tests | Vitest |

## Where Things Live

| Where | Route | Role | Status |
|---|---|---|---|
| Landing | `/` | the front door — what di.iiii is, and the way in | Active |
| Public Space View | `/<space>` | live published project route for a space | Active |
| Studio | `/<space>/studio` | the main editor | Active |
| Node editor | `/<space>/raw` | node-first editing: nodes, ports, wires | Active |
| Admin/Ops | `/admin?space=<space>` | operator/debug/status route | Active |
| `serverXR` | — | backend runtime for spaces, projects, assets, ops, presence | Required |

## Core Model

- **space** — a place that is yours: an address, a guest list, and everything in it. Owns routes like `/<space>`, `/<space>/studio`, `/<space>/raw`
- **project** — one thing you make inside a space
- **publishedProjectId** — the project currently exposed on the public route for a space
- canonical project direction: `rootNodeId`, `nodes[]`, `edges[]`, `assets[]`, `templates[]`, `workspaceState`

## Getting Started

```bash
nvm use
npm install
npm --prefix serverXR install
```

```bash
# Start frontend dev server
npm run dev

# Start backend dev server
npm run dev:server

# Lint
npm run lint

# Build
npm run build

# Run tests
npm run test
npm run test:server-contracts
```

Local routes after starting:

- `http://localhost:5173/`
- `http://localhost:5173/main/studio`
- `http://localhost:5173/main/raw`
- `http://localhost:5173/admin?space=main`
- `http://localhost:4000/serverXR/api/health`

## Where to Work

- `src/studio/` — the main editor, default for main product UI work
- `src/raw/` — the node editor
- `src/project/` — shared document, sync, presence, asset, and viewer/editor logic
- `src/shared/` and `shared/` — schema and runtime contract layer
- `serverXR/` — backend runtime, auth, assets, persistence, SSE, and presence

Contribution rules:

- Prefer `Studio` for main user-facing product work unless explicitly experimental
- Prefer `src/project/` for shared document and collaboration behavior
- Prefer node-first definitions over growing legacy object/window systems

## North Star

- `di.iiii` should behave like a Web XR visual programming language for creating realities, not only scenes or layouts
- Everything important should become node-native: world behavior, view behavior, authored media, runtime tools, nested projects
- The web remains a universal substrate for authoring, sharing, and runtime connectivity

## Status

| Area | Current State |
|---|---|
| Main editor | `Studio` |
| Node editor | `/<space>/raw` |
| Public route | `/<space>` shows the published project, or the older editor when nothing is published |
| Backend authority | `serverXR` owns spaces, projects, assets, ops, presence, and edit enforcement |
| Canonical model direction | recursive node-first project documents |
| Shared logic center | `src/project/` |

## Contributing

Issues and pull requests are welcome. This repo is the public collaboration home for `di.iiii`.

For architecture context see [docs/architecture/](docs/architecture/).
