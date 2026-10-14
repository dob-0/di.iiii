# fix/door-test-port-collision-2026-10-13

## 2026-10-13 — the door test's port collision (lead dob-2e)

- dev's deploy after #893 failed in `serverXR/src/localNameContracts.test.js` (200 where 421 was due).
  Cause: the door port and the main port both came from `getFreePort` and could be one number; the door then half-held its
  port. `start()` retries on a new door port (3 tries); a new test forces a held port and proves the retry (fails without it).
  Known-fixes row added.
