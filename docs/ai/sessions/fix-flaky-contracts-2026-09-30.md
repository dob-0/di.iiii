## 2026-09-30 — httpContracts waits on events, not sleeps; SpaceHub stub case waits on its state

**httpContracts.test.js** (87 cases, each boots a real serverXR). Cause of the time and the red:
200ms `/api/health` poll per boot (~100ms idle x 87); the open-space restore case polled for a boot
snapshot that `index.js` took fire-and-forget (a real race with the first writes — fixed in the server:
the snapshot is now awaited before listen); `getFreePort` closes its probe before the child binds (port
stolen -> boot dies with EADDRINUSE); five sleeps (20ms x2 clock guard, 500ms and 1000ms "nothing extra
arrived", 200ms/100ms polls). Now: ready = the server's own listen log line, EADDRINUSE alone retried
on a fresh port, bot waits are events, "nothing sent" is proved by a notices-on control server against
the same bot. Measured (`vitest run`, `--reporter=verbose`, one file): before 34.09 / 32.86 / 34.57 s;
after 22.51 / 22.47 / 22.23 s, 87/87 each time. Slowest case now 599ms (was 1444ms).
Limit: a late duplicate notice is excluded by ordering (it would be sent before the awaited one and fail
the summary text), not by a clock.

**SpaceHub.test.jsx preview-stub case.** Not reproduced: 6/6 green (3 idle, 3 with four CPU burners),
case takes ~80ms; the 8s was only a ceiling. The case asserted "s12 absent" after waiting only for s0,
which is vacuous while the other cards still mount. It now waits for the real state (12 preview frames
mounted) and the explicit 8000ms overrides are gone. Owed: root cause of the CI-only failure is
unproven — if it recurs, capture the CI log of the failing assertion.
