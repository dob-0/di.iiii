---
name: dii-project-sync-ops
description: 'Work on collaborative project sync, op delivery, presence, and live document flow. Use when changing src/project sync hooks, SSE catch-up, Socket.IO presence, queued ops, or project document reconciliation with serverXR.'
argument-hint: 'Describe the sync, ops, or presence change'
---

# dii Project Sync And Ops

## When to Use
- You are changing collaborative editing, project document syncing, or live presence.
- A bug involves local ops, remote ops, queue flushing, SSE catch-up, or Socket.IO cursor state.
- A new op type needs to travel from client to server and back.

## Outcome
Make the smallest shared sync change that preserves deduplication, version ordering, server authority, and peer visibility.

## Procedure
1. Start in src/project/AGENTS.md and identify the owning shared hook or service before touching a lane-specific surface.
2. Trace one concrete path:
   - local action
   - op creation
   - queue submission
   - server persistence
   - remote delivery
   - peer application
3. State one falsifiable hypothesis about where the failure or required behavior lives.
4. Change the owning sync layer first, not the UI wrapper that merely forwards state.
5. Check whether the server contract or broadcast format must change in serverXR/src.
6. Preserve deduplication, ordering, and reconnect behavior.
7. Validate with the narrowest nearby test, then run the broader contract check when the network boundary changed.

## Shared Rules
- The server document and ops stream are authoritative.
- Do not duplicate shared sync logic into Studio or Beta unless the behavior is intentionally lane-specific.
- Check src/shared first when the change is really schema or op truth.
- Treat SSE catch-up and Socket.IO presence as adjacent but distinct paths.

## Debugging Flow
### Local op path
1. Confirm how the op is created and tagged.
2. Confirm queueing and flush conditions.
3. Confirm server acceptance or version conflict behavior.
4. Confirm the new version and op payload returned to the client.

### Remote sync path
1. Confirm the SSE or events endpoint emits the expected payload.
2. Confirm the client listener applies remote ops once.
3. Confirm duplicate op IDs are ignored.
4. Confirm reconnect or catch-up logic resumes from the correct version.

### Presence path
1. Confirm room or project subscription is correct.
2. Confirm presence payload shape and throttling.
3. Confirm peers clear stale state on disconnect.

## Repo Anchors
- Shared sync guide: ../../src/project/AGENTS.md
- Backend guide: ../../serverXR/src/AGENTS.md
- Workflow map: ../../docs/ai/workflows.md
- Useful tests:
  - ../../src/project/hooks/useProjectDocumentSync.test.jsx
  - ../../serverXR/src/projectContracts.test.js
  - ../../serverXR/src/socketHandlers.test.js

## Validation
- Shared client sync changes: npm run test and npm run build
- Network boundary, persistence, SSE, or auth changes: npm run test:server-contracts and npm run test

## Completion Checks
- Local ops still flush correctly.
- Remote ops apply once and in order.
- Version conflicts are handled rather than hidden.
- Presence updates do not leak or linger after disconnect.
- Shared behavior still works for multiple editor lanes.
