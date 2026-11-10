## 2026-11-10 — live-log: a hub that is down is hub-down (exit 0)

- aylmo ran 13 failed di-live-log-what-we-have ticks in 26 min on 11-09, all GET 503/530. Now hub-down, exit 0, the next 2-minute tick retries; 401/403/404/500 stay exit 1.
- Test: scripts/production/live-log.test.js, 13 passed, 0 FAIL lines, rc 0 (6 new red before, run against a local http server).
- Not done: nothing installed or restarted; the live copy follows after merge.
