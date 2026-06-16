# src/project AGENTS

Short routing guide for AI agents working in `src/project/`.

## What This Area Owns

- normalized project document flow
- shared project API access to `serverXR`
- durable project ops and SSE catch-up
- collaborator presence for project editors
- public live project viewing
- import paths that convert older data into project documents

## When To Edit Here

- edit here when the change should work across more than one editor lane
- start here for shared project sync, shared viewer behavior, project presence, or project asset transport
- check `src/shared/projectSchema.js` first when the change affects document shape, defaults, normalization, or op behavior

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../../serverXR/src/AGENTS.md](../../serverXR/src/AGENTS.md)
- [../../src/shared/AGENTS.md](../../src/shared/AGENTS.md)
- `../../src/shared/projectSchema.js`

## Do Not Assume

- do not duplicate shared project sync logic into `Studio` or `Beta` unless there is a strong reason
- do not treat Beta alias exports in `projectsApi.js` as a separate backend contract
- do not change client document shape without checking `src/shared/projectSchema.js`
- do not treat local reducer state as the authoritative saved state; the server document and ops stream are authoritative

## Validation And Tests

- `npm run test`
- `npm run test:server-contracts` when the change crosses the network boundary
- nearby tests:
  - `src/project/hooks/useProjectDocumentSync.test.jsx`
  - `src/project/services/projectsApi.test.js`
  - `src/project/import/projectImportAssets.test.js`
  - `src/project/nodeRegistry.test.js`
  - `src/project/components/PublicProjectViewer.test.jsx`

## One-Line Summary

If a change should affect shared project documents, shared sync, shared presence, or the public published viewer, it probably belongs in `src/project/`.
