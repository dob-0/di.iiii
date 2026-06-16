# serverXR/src AGENTS

Short routing guide for AI agents working in `serverXR/src/`.

## What This Area Owns

- backend routing and app bootstrap behind `/serverXR`
- auth access rules and browser auth sessions
- space and project persistence
- upload validation, asset streaming, release info, and shared schema loading
- SSE and Socket.IO realtime behavior

## When To Edit Here

- edit here for HTTP contract changes, auth/session behavior, persistence behavior, upload/runtime changes, or realtime updates
- start here when the server should become more or less authoritative about a space or project action
- move to `src/shared/` if the change is really a schema/runtime truth change
- check `src/project/` when the backend change affects client sync behavior or public viewer expectations

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../../src/project/AGENTS.md](../../src/project/AGENTS.md)
- [../../src/shared/AGENTS.md](../../src/shared/AGENTS.md)
- [../README.md](../README.md)

## Do Not Assume

- do not treat frontend state as authoritative over saved server state
- do not bypass auth/session helpers when changing protected write behavior
- do not change route or persistence behavior without checking contract tests
- do not treat `serverXR` as optional; it is authoritative for publish state and write enforcement

## Validation And Tests

- `npm run test:server-contracts`
- `npm run test`
- nearby tests:
  - `serverXR/src/httpContracts.test.js`
  - `serverXR/src/projectContracts.test.js`
  - `serverXR/src/socketHandlers.test.js`
  - `serverXR/src/projectStore.test.js`
  - `serverXR/src/config.test.js`

## One-Line Summary

If the change affects auth, persistence, routes, upload/runtime behavior, publish state, SSE, or Socket.IO presence, it belongs in `serverXR/src/`.
