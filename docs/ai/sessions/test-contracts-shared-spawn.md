## 2026-09-30 — the five remaining contract files move to the shared spawn helper

Closes the "owed" item of `fix-flaky-contracts-2026-09-30.md`. `bundleContracts`, `installBundleContracts`,
`fallbackContracts`, `spaHostingContracts` and `httpContracts` now boot serverXR through
`serverXR/src/testSupport/spawnServer.mjs` (`spawnServerUntilReady`): ready = the child's own
"Server running. Listening on:" line, EADDRINUSE alone retried on a fresh port. One commit per file.

**What the four old copies did** (identical apart from env): `getFreePort()` (probe socket closed before
the child binds) then poll `GET /api/health` every 200ms until `response.ok`, 15s guard. A port a sibling
file's server takes in between answers the poll from the wrong process (other token / REQUIRE_AUTH), so
the test talks to the wrong instance: the "expected 401 to be 201" seen on projectContracts. They also
leaked the child if the health wait threw (the handle was registered after it). Each file keeps its own
env, auth setup, `stop()` and temp-dir handling; only port choice, spawn, log capture and readiness moved.
`httpContracts` already had the ready-line logic inline (from #674's predecessor); it was replaced by the
helper call and keeps its single post-boot `/api/health` request (a route check, not a readiness wait).
The stale "waitForHealth allows 15s" comments now name `spawnServerUntilReady`.

**Measured** (`vitest run <file> --maxWorkers=2 --reporter=verbose`, single file, 3 runs each, Duration
as vitest prints it; laptop shared with other agents' work, so read differences under ~1s as noise):

| File | Cases | Before (s) | After (s) |
|---|---|---|---|
| bundleContracts | 2 | 2.03 / 2.02 / 1.81 | 1.42 / 1.42 / 1.42 |
| installBundleContracts | 5 | 4.13 / 4.13 / 4.57 | 3.28 / 3.31 / 3.31 |
| fallbackContracts | 12 | 5.12 / 5.31 / 5.56 | 3.35 / 3.25 / 3.24 |
| spaHostingContracts | 9 | 3.82 / 3.82 / 3.83 | 2.55 / 2.33 / 2.32 |
| httpContracts | 87 | 23.96 / 23.68 / 23.16 | 23.47 / 23.24 / 22.94 |

All cases passed in every run. The four polling files save ~0.4-1.9s (the 200ms poll granularity per
boot); httpContracts already waited on the listen line, so no speedup is claimed there. The race fix
itself is derived, not observed: the failure was never reproduced locally, and the timings above do not
prove it gone. CI (parallel files) is the check.

Not run here, by house rule (fan fault): the full suite, build, Playwright.

**Owed (out of the five asked for):** a grep shows `syncContracts`, `ndiContracts` (spawns with
`--require preload`, which the helper's fixed argv does not take) and `projectVisibilityContracts` still
carry their own `net.createServer` free-port probe + spawn, so the same race applies to them.
`placeContracts` has no spawn. Not touched in this change.
