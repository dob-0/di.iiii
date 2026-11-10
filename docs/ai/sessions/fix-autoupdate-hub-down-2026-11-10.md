## 2026-11-10 — autoupdate: a hub that is down is hub-down (exit 0) for the first hour

- aylmo ran 132 failed di-autoupdate ticks in 7 days (journalctl --user), every one a hub 502/503 or fetch failed in two outages (11-03, 11-09). Now logged as hub-down, exit 0; after 12 ticks in a row (1 hour) it is failed again. Real faults (404, checksum, EACCES) unchanged.
- Test: scripts/di/autoupdate.test.js, 21 passed, 0 FAIL lines, rc 0 (4 new, red before).
- Not done: nothing installed or restarted; the live copy follows after merge.
