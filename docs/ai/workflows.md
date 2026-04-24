# AI Workflow Guide

This page tells an agent where to start and what to check next.

## Choose A Starting Point

| Change type | Start here | Check next |
| --- | --- | --- |
| Main shipped editor UX | `src/studio/` | `src/project/`, `src/shared/` |
| Shared project sync/viewer/presence | `src/project/` | `src/shared/`, `serverXR/src/` |
| Canonical document shape or ops | `src/shared/` | `src/project/`, `serverXR/src/` |
| Experimental node-first UX | `src/beta/` | `src/project/`, `src/shared/` |
| Backend auth/persistence/routes/realtime | `serverXR/src/` | `src/project/`, `src/shared/`, `serverXR/README.md` |
| Release automation or local helper scripts | `scripts/` | `deploy/`, `.github/workflows/` |
| Deployment docs/examples/templates | `deploy/` | `scripts/`, `docs/deploy/`, `serverXR/README.md` |

## Default Edit Sequence

1. read the nearest scoped `AGENTS.md`
2. confirm whether the change is lane-specific or shared
3. move upward to `docs/ai/` only when the scoped guide is not enough
4. check adjacent schema/runtime/backend files before making assumptions
5. update canonical docs first when architecture or workflow truth changes
6. run `npm run docs:ai:sync` after canonical AI-doc changes

## Shared Vs Lane-Specific Changes

Push changes downward only when needed:

- if both `Studio` and `Beta` should benefit, prefer `src/project/`
- if the change is schema/runtime truth, prefer `src/shared/`
- if the change is only the shipped main editor shell or UX, prefer `src/studio/`
- if the change is deliberately experimental, prefer `src/beta/`

## Branch And Release Flow

- normal branch flow: `dev -> staging -> main`
- start routine work on `dev`
- use `main` directly only for emergency production hotfixes
- deployment automation and host apply scripts live in `scripts/` and `deploy/`

## AI Docs Maintenance Workflow

When canonical AI docs change:

1. update `AGENTS.md` or `docs/ai/`
2. run `npm run docs:ai:sync`
3. run `npm run docs:ai:check`
4. fix drift before finishing

Generated bridge files are output artifacts. Do not hand-edit them.
