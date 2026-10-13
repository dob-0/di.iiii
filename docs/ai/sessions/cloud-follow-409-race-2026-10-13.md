# cloud/follow-409-race-2026-10-13

## 2026-10-13 — a stopped follow no longer carries the edit that ends its parked read (the CI-only 409, ledger N592)

- dev's deploy run 38414913477 at f4a8e89c failed one test of 10362: `followIntegration.test.js` "agrees on the host's
  value when both sides change the same field at the same moment", 409 where 200 was due on the FOLLOWER's write (line 563).
  (Its attempt 2 failed a different, unrelated test: `PublicProjectViewer.test.jsx` timed out at 5 s.)
- First the failure says why: that test's writes now fail with the refusal body and both servers' logs.
- Cause, read from `follower.js`: `stop()` set a flag and nothing else. The room's read stays parked on the host for up to
  20 s; the test's host edit ended that park, and the STOPPED follow carried the edit into the follower's install, moving
  its version between the test's read of it and its write → 409. Timing-dependent, so CI-only. It also defeated the test's
  own premise (each side to see its own edit first).
- Fix: `stop()` aborts the parked read and ends the sleep; a read that comes back after stop writes nothing.
- Regression test: a counting proxy in front of the host proves the follow is parked, stops it, writes on the host, and
  checks for 2 s that nothing was carried. Without the fix: fails (`op-after-stop` carried, 1/1 runs, ~1 s). With it: see PR.
- The original 409 was not reproduced locally — the diagnosis is from code plus the regression test, UNVERIFIED on CI
  until this PR's run.
