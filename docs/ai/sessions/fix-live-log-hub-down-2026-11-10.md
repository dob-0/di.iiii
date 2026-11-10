## 2026-11-10 — live-log: a hub that is down is hub-down (exit 0)

- aylmo ran 13 failed di-live-log-what-we-have ticks in 26 min on 11-09, all GET 503/530. Now hub-down, exit 0, the next 2-minute tick retries; 401/403/404/500 stay exit 1.
- Test: scripts/production/live-log.test.js, 13 passed, 0 FAIL lines, rc 0 (6 new red before, run against a local http server).
- Not done: nothing installed or restarted; the live copy follows after merge.

## 2026-11-10 — live-log hub-down: a bounded quiet (review round, f-1259)

- Review found two mediums: hub-down was exit 0 for any length of time, and a DNS failure (ENOTFOUND, EAI_AGAIN) was the same, untested.
- Now a count of hub-down ticks in a row (and since when) sits in `~/.cache/di/live-log/hub-down-<project>-<chat>.json` (not in the repository). Timer read: `OnUnitActiveSec=2min`, so N = 15 ticks = about 30 minutes; the 15th tick exits 1 with one line "hub-down since <stamp>". A success removes the file; a garbage or missing file counts from 0, an unwritable place exits 1. Cloudflare 521-524 are hub-down too.
- Test: scripts/production/live-log.test.js 13 -> 51 tests (37 red before), `scripts/production/` 90 passed, 0 FAIL lines, rc 0, 10 runs in a row, 0 failed.
- Not done: no timeout on fetch (TimeoutStartSec=300 covers it); nothing installed, the live copy follows after merge.
