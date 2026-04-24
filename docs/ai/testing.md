# AI Testing Guide

This page maps repo changes to validation steps.

## Core Commands

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
npm run docs:ai:sync
npm run docs:ai:check
```

## What Each Command Covers

- `npm run lint`
  - runs ESLint on `src/`
  - best for frontend and shared client changes
- `npm run build`
  - runs the Vite production build
  - best for confirming frontend bundle integrity
- `npm run test`
  - runs the Vitest suite
  - best default regression check for repo work
- `npm run test:server-contracts`
  - runs explicit backend contract tests for `serverXR`
  - use when HTTP contract, auth/session flow, or project/space API behavior changes
- `npm run docs:ai:sync`
  - regenerates tool-native bridge files from canonical AI docs
- `npm run docs:ai:check`
  - validates AI-doc structure, links, scope coverage, and generated-file drift

## Change-To-Validation Matrix

| Change type | Minimum useful checks |
| --- | --- |
| `src/studio/`, `src/project/`, `src/shared/`, `src/beta/` | `npm run test`, `npm run build` |
| `serverXR/src/` routes/auth/persistence | `npm run test:server-contracts`, `npm run test` |
| `scripts/` or deploy logic | targeted script dry-runs or inspection plus `npm run test` when covered |
| AI docs, AGENTS, generated bridges | `npm run docs:ai:sync`, `npm run docs:ai:check` |

## Useful Nearby Tests

- shared project logic:
  - `src/project/hooks/useProjectDocumentSync.test.jsx`
  - `src/project/services/projectsApi.test.js`
  - `src/project/components/PublicProjectViewer.test.jsx`
- shared schema/runtime:
  - `src/shared/projectSchema.test.js`
- Studio:
  - `src/studio/components/StudioHub.test.jsx`
  - `src/studio/components/StudioPresentationSurface.test.jsx`
  - `src/studio/utils/studioRouting.test.js`
- backend:
  - `serverXR/src/httpContracts.test.js`
  - `serverXR/src/projectContracts.test.js`
  - `serverXR/src/socketHandlers.test.js`
  - `serverXR/src/projectStore.test.js`
  - `serverXR/src/config.test.js`

## CI Snapshot

Current `ci.yml` runs:

- dependency install
- `npm run lint`
- `npm run build`
- `npm run test`

AI-doc drift checks should also run in CI, so treat `npm run docs:ai:check` as part of the expected validation path after this system lands.
