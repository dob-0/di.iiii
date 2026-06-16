# src/beta AGENTS

Short routing guide for AI agents working in `src/beta/`.

## What This Area Owns

- the experimental Beta editor lane
- node-first and research-oriented editor workflows
- Beta hub/editor routing, local UX, and experimental state/services

## When To Edit Here

- edit here for intentionally experimental, research, or node-first behavior
- use this area when the change should affect Beta-specific UX or experimental editor flow
- move to `src/project/` if the change should also affect shared project sync, presence, or public viewing
- move to `src/shared/` if the change affects canonical schema/runtime truth

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../shared/AGENTS.md](../shared/AGENTS.md)
- `../studio/` when deciding whether a behavior is experimental or mainline

## Do Not Assume

- do not treat `Beta` as the main shipped product lane
- do not fork shared project logic into Beta unless the behavior is intentionally experimental
- do not move canonical schema changes into Beta-only state or utilities

## Validation And Tests

- `npm run test`
- `npm run build`
- nearby tests:
  - `src/beta/state/projectStore.test.js`
  - `src/beta/utils/localWorkspaceStorage.test.js`
  - `src/beta/utils/windowLayout.test.js`
  - `src/beta/utils/betaRouting.test.js`

## One-Line Summary

Use `src/beta/` for experimental node-first behavior, but keep shared document logic in `src/project/` and canonical schema truth in `src/shared/`.
