# src/studio AGENTS

Short routing guide for AI agents working in `src/studio/`.

## What This Area Owns

- the main shipped Studio authoring lane
- Studio route selection between hub and project editor
- Studio shell, hub, editor, inspector, viewport, and presentation-surface UI
- Studio-only layout preferences and route helpers

## When To Edit Here

- edit here for shipped Studio UX, Studio-only routing, or Studio-specific shell behavior
- start elsewhere if the change should also affect `Beta` or the public viewer
- move to `src/project/` when the change is shared project sync, shared viewer logic, project presence, or shared project API behavior
- move to `src/shared/` when the change affects canonical project schema or shared runtime defaults

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../shared/AGENTS.md](../shared/AGENTS.md)
- `../components/` and `../hooks/` when Studio composes older shared UI behavior

## Do Not Assume

- do not duplicate shared project sync logic here if the change should live in `src/project/`
- do not treat `Studio` as the most node-native surface; that is still the experimental `Beta` lane
- do not move canonical schema decisions into Studio-only state or components

## Validation And Tests

- `npm run test`
- `npm run build`
- nearby tests:
  - `src/studio/components/StudioHub.test.jsx`
  - `src/studio/components/StudioPresentationSurface.test.jsx`
  - `src/studio/hooks/useStudioLayoutPrefs.test.js`
  - `src/studio/utils/studioRouting.test.js`

## One-Line Summary

Use `src/studio/` for the shipped main editor lane, but move shared document behavior down into `src/project/` and canonical schema/runtime behavior into `src/shared/`.
