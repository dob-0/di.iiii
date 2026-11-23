## 2026-11-10 — autoupdate: a hub that is down is hub-down (exit 0) for the first hour

- aylmo ran 132 failed di-autoupdate ticks in 7 days (journalctl --user), every one a hub 502/503 or fetch failed in two outages (11-03, 11-09). Now logged as hub-down, exit 0; after 12 ticks in a row (1 hour) it is failed again. Real faults (404, checksum, EACCES) unchanged.
- Test: scripts/di/autoupdate.test.js, 21 passed, 0 FAIL lines, rc 0 (4 new, red before).
- Not done: nothing installed or restarted; the live copy follows after merge.

## 2026-11-10 — autoupdate hub-down: review round 1 (f-1258)

- Fixed: a garbage `hubDownRuns` in the state file (string, object, array, negative, float) kept hub-down silent for ever; now read through `savedHubDownRuns` (positive integer, else 0). A heat skip no longer resets the count. `di autoupdate status` shows "N of 12 runs".
- Test: scripts/di/autoupdate.test.js, 50 passed, 0 FAIL lines, rc 0 (8 red before); a table test for every classifier branch (429, 5xx, ECONNREFUSED/RESET, ETIMEDOUT, EAI_AGAIN, ENOTFOUND, fetch failed = hub-down; 401, 403, 404, 400, 200, checksum, EACCES = failed).
- Not done: classifier still matches the words anywhere in the text (low, bounded by the 12-run limit); the limit counts runs, not time.
