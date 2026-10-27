## Test harness: no test server starts on a port the test picked and released (EADDRINUSE flake)

Branch `fix/test-harness-port-0-2026-10-20`. Trigger: `followIntegration.test.js` failed 1 in 10 with `listen EADDRINUSE 0.0.0.0:42421`.

What changed:
- `serverXR/src/testSupport/spawnServer.mjs`: `spawnServerUntilReady` takes `nodeArgs` and an optional pinned `port` (restart of the same install); retries a lost race up to 5 times on a new port.
- 16 test files that hand-rolled "probe a port, close it, spawn, poll health" now use it (follow, join, machines, catalogue, gracefulShutdown, laserShutdown, ndi, place, projectMove, projectVisibility, proposal, shelfScope, show, spaceArchive, spaceTrash, sync). `localName.test.js` binds its door on port 0 and reads the bound port.
- `testSupport/noPickedPort.test.js`: fails on the unfixed code (17 files listed), passes after.
- `gracefulShutdown.test.js` `findDb` tolerates the lock directory that vanishes mid-walk (exposed by the faster ready signal).

Why not `PORT=0` in the server: `config.js` reads `Number(process.env.PORT) || 4000` and `index.js` copies the number into several derived values (`SELF_API_URL`, addresses, events); making the server accept 0 is a production change, so the harness is fixed instead: the child's own bind is the proof, a lost race is retried.

Not done: `localNameContracts.test.js` still picks the DOOR port with `getFreePort` (the door is a second listener inside the child; it stands aside by name on a taken port and the test already forces that case). Owed if it ever flakes.

CI fix (2026-10-20): `spawnServer.test.js` expected 3 servers per lost-race retry, but this branch raised the helper's cap to 5 (17 files now race), so it failed deterministically on CI (it also failed locally once run on this branch; no slowness involved). All 5 servers are stopped, none leaks. The cap is now one exported constant `MAX_ATTEMPTS` and the test counts against it (and still fails if a retry leaves a server behind: checked by disabling `stopChild`).
