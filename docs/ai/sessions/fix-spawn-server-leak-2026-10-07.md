## 2026-10-07 — a test server that never became ready is stopped, not left running

- Found by lane M1 of the bug sweep, which saw an orphan `node serverXR/src/index.js` (parent gone, running 22 minutes) after "Server did not become ready in time" in a batch run at load average 5. On this laptop an orphan is real heat and a held database file.
- Cause by reading `spawnServer.mjs`: the 15 s guard rejects, but the child it spawned is still running and the caller never receives its handle; the EADDRINUSE retry then started another beside it. Fixed with `stopChild` before the retry or the throw, and the guard became the `readyTimeoutMs` option (default unchanged) so the failure can be tested in 0.4 s.
- Guard: `serverXR/src/testSupport/spawnServer.test.js` (a stub that stays alive and never listens). Measured in one queue slot: with only the option added, the aliveness assertions fail; with the fix they pass, and no stub is left running after either run.
- Undone: the suites that boot a server still rely on their own `afterAll` to stop a server that DID start; a suite whose `beforeAll` dies after a successful spawn would still leak — not seen, not changed.
