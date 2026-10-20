## 2026-10-21 — the two scripts/ tests that picked a port by hand now let the server prove it holds it

- `scripts/space-cleanup.test.js` starts its throwaway serverXR through `spawnServerUntilReady`
  (`serverXR/src/testSupport/spawnServer.mjs`): ready = that child's own listen line, EADDRINUSE retried on a new port.
  Its own `freePort` and `/api/health` poll are gone (a sibling's server could answer that poll).
- `scripts/di/openFile.test.js` goes through `di up`, which reads its port from `di.env`, so the number is still
  chosen before the bind (the CLI has no port 0). The test now counts a port only when that install's `server.log`
  says `Listening on: 127.0.0.1:<port>` and the pid file's process is alive. EADDRINUSE or "already running" →
  `di down`, kill, new port, up to `MAX_ATTEMPTS` (5). Retry path exercised once by holding the first candidate:
  attempt 1 died EADDRINUSE on 32871, attempt 2 came up on 38599, 6/6 passed.
- Guard `serverXR/src/testSupport/noPickedPort.test.js` now walks `serverXR/src` AND `scripts/` (each root must hold
  >50 test files). Before the fix it failed naming both files (probe check) and space-cleanup (PORT check).
  `PORT_ENV` skips a line where a quote comes first — `scripts/di/lan.test.js:71` asserts that text as a string.
- 10/10 runs in a row each: openFile ~12.2s, space-cleanup ~2.2s.
- Left alone on purpose: `scripts/rig/lib.mjs` `freePort` (production code for start-member, not a test).
- Not done: the "already running" retry branch (a sibling's HTTP server on the candidate) was not forced in a test;
  `di up` binding port 0 and reporting it would remove the guess entirely and is a CLI change, not made here.
