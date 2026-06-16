---
name: dii-schema-op-changes
description: 'Change project or scene schema safely across client and server. Use when adding fields, defaults, normalization rules, versioned ops, or legacy compatibility bridges in src/shared and shared.'
argument-hint: 'Describe the field, op, or schema change'
---

# dii Schema And Op Changes

## When to Use
- A field should exist everywhere the project document exists.
- Normalization, defaults, cloning, merge behavior, or versioning needs to change.
- A new op type or payload shape must work across runtimes.
- Legacy bridges such as worldState or windowLayout may be affected.

## Outcome
Update canonical schema truth first, keep the client and server mirrors aligned, then validate consumers.

## Procedure
1. Start in src/shared/AGENTS.md to confirm the change is schema-level.
2. Identify the canonical surface that must change first:
   - src/shared for frontend runtime truth
   - shared for backend runtime mirror
3. Update defaults and normalization before changing consumers.
4. If the data is mutable through ops, add or update the op application rules in both runtime copies.
5. Check whether the change touches compatibility bridges such as worldState, windowLayout, or older entity-derived structures.
6. Inspect the nearest project consumer in src/project and any backend persistence or route code in serverXR/src.
7. Add or update focused tests before widening into UI work.
8. Validate the full round trip: normalize, apply ops, persist, fetch, and render.

## Required Checks
- Keep src/shared and shared aligned for any canonical schema or op change.
- Do not put lane-specific UI decisions into schema code.
- Do not change document shape without checking project sync and backend persistence.
- Prefer backward-compatible normalization when existing saved docs may omit the new field.

## Common Flow
### Adding a field
1. Add the default value.
2. Normalize missing or malformed input.
3. Mirror the change across both runtime copies.
4. Update project or server consumers that assume the old shape.
5. Add tests for missing input and valid round-trip behavior.

### Adding an op
1. Define the op shape and payload expectations.
2. Add op application logic in both runtime copies.
3. Check versioning or migration implications.
4. Verify the client emits the op and the server persists and rebroadcasts it.
5. Add tests for duplicate handling, bad payloads, and correct state changes.

## Repo Anchors
- Shared guide: ../../src/shared/AGENTS.md
- Project guide: ../../src/project/AGENTS.md
- Backend guide: ../../serverXR/src/AGENTS.md
- Shared tests: ../../src/shared/projectSchema.test.js
- Project sync tests: ../../src/project/hooks/useProjectDocumentSync.test.jsx
- Server contracts: ../../serverXR/src/projectContracts.test.js

## Validation
- Minimum: npm run test
- When frontend consumers may break: npm run build
- When backend contracts or persistence are affected: npm run test:server-contracts

## Completion Checks
- Both runtime copies are aligned.
- Old documents still normalize safely.
- Mutable fields have matching op support when needed.
- Project sync and persistence consumers still accept the shape.
- Tests cover defaults, malformed input, and round-trip application.
