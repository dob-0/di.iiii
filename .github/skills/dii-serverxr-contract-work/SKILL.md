---
name: dii-serverxr-contract-work
description: 'Change serverXR routes, auth, persistence, uploads, publish state, SSE, or Socket.IO safely. Use when editing backend contracts and verifying that client-facing behavior remains authoritative and test-covered.'
argument-hint: 'Describe the backend route, auth, or realtime change'
---

# dii serverXR Contract Work

## When to Use
- You are editing serverXR/src routes, auth helpers, persistence, upload handling, publish state, SSE, or Socket.IO behavior.
- A frontend change depends on a backend contract update.
- A bug involves write authority, document persistence, or realtime delivery from the server.

## Outcome
Implement backend-authoritative behavior with explicit contract validation before relying on manual browser checks.

## Procedure
1. Start in serverXR/src/AGENTS.md and identify whether the change is auth, persistence, route behavior, upload/runtime handling, or realtime behavior.
2. Find the nearest existing route, contract test, or socket handler that already matches the behavior.
3. State the exact contract change in request, response, auth, or event terms.
4. Change the authoritative backend path first.
5. Inspect adjacent shared schema and src/project consumers if the payload or document shape changes.
6. Add or adjust the narrowest contract test that can fail for the intended behavior.
7. Run server contract tests before broadening the patch.
8. Only after backend validation succeeds, patch any client assumptions that need to follow it.

## Required Rules
- Do not treat frontend state as authoritative over saved server state.
- Do not bypass auth or session helpers for protected writes.
- Do not change route behavior without checking the relevant contract tests.
- If publish state, uploads, or realtime payloads change, inspect both route code and clients that consume them.

## Common Flows
### Route or persistence change
1. Update the route or store logic.
2. Check error codes for not found, forbidden, and conflict cases.
3. Verify persistence and follow-up reads.
4. Verify emitted events when the route should notify peers.

### Auth or session change
1. Update the auth helper or guard.
2. Verify scope rules for spaces and roles.
3. Test both allowed and rejected writes.
4. Check production-default behavior if REQUIRE_AUTH is involved.

### Realtime change
1. Update the event source and payload.
2. Verify room targeting and disconnect cleanup.
3. Check project sync or presence clients for compatibility.

## Repo Anchors
- Backend guide: ../../serverXR/src/AGENTS.md
- Backend README: ../../serverXR/README.md
- Shared schema guide: ../../src/shared/AGENTS.md
- Project sync guide: ../../src/project/AGENTS.md
- Core tests:
  - ../../serverXR/src/httpContracts.test.js
  - ../../serverXR/src/projectContracts.test.js
  - ../../serverXR/src/socketHandlers.test.js
  - ../../serverXR/src/config.test.js

## Validation
- Minimum backend check: npm run test:server-contracts
- Broader regression check: npm run test

## Completion Checks
- The server remains authoritative for writes and published state.
- Contract tests cover success, failure, and auth boundaries.
- Shared schema or client sync consumers were checked when payloads changed.
- Realtime behavior still reaches the intended clients and clears cleanly.
