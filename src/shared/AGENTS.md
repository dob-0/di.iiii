# src/shared AGENTS

Short routing guide for AI agents working in `src/shared/`.

## What This Area Owns

- canonical cross-runtime project and scene schema logic
- document defaults, normalization, cloning, versioning, and op application
- shared data-model truth used by both client and backend code

## When To Edit Here

- edit here when project or scene document shape changes
- edit here when defaults, version numbers, normalization, merge behavior, or op application rules change
- start here before changing client or server code if the task says a field or operation should exist everywhere

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../../serverXR/src/AGENTS.md](../../serverXR/src/AGENTS.md)
- `../../shared/` runtime mirrors used by the backend

## Do Not Assume

- do not treat this as client-only or server-only code
- do not change schema shape here without checking who consumes it in `src/project/` and `serverXR/src/`
- do not push lane-specific UI decisions into the canonical schema layer

## Validation And Tests

- `npm run test`
- `npm run build` when frontend consumers may be affected
- nearby tests:
  - `src/shared/projectSchema.test.js`

## One-Line Summary

If the task changes what a project or scene document is, how it normalizes, or how ops apply across runtimes, it belongs in `src/shared/`.
