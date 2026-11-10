## 2026-11-10 — live-log: a hub that is down is hub-down (exit 0)

- the timer's machine ran 13 failed di-live-log-what-we-have ticks in 26 min on 11-09, all GET 503/530. Now hub-down, exit 0, the next 2-minute tick retries; 401/403/404/500 stay exit 1.
- Test: scripts/production/live-log.test.js, 13 passed, 0 FAIL lines, rc 0 (6 new red before, run against a local http server).
- Not done: nothing installed or restarted; the live copy follows after merge.

## 2026-11-10 — live-log hub-down: a bounded quiet (review round, f-1259)

- Review found two mediums: hub-down was exit 0 for any length of time, and a DNS failure (ENOTFOUND, EAI_AGAIN) was the same, untested.
- Now a count of hub-down ticks in a row (and since when) sits in `~/.cache/di/live-log/hub-down-<project>-<chat>.json` (not in the repository). Timer read: `OnUnitActiveSec=2min`, so N = 15 ticks = about 30 minutes; the 15th tick exits 1 with one line "hub-down since <stamp>". A success removes the file; a garbage or missing file counts from 0, an unwritable place exits 1. Cloudflare 521-524 are hub-down too.
- Test: scripts/production/live-log.test.js 13 -> 51 tests (37 red before), `scripts/production/` 90 passed, 0 FAIL lines, rc 0, 10 runs in a row, 0 failed.
- Not done: no timeout on fetch (TimeoutStartSec=300 covers it); nothing installed, the live copy follows after merge.

## 2026-11-10 — live-log hub-down: second review round (f2-1259)

- Test gap: the reset on the "page is already current" path (the most common success) had no test. New process tests: a state file with count 10, hub up, page current -> "unchanged" and the state file gone.
- Rule now: a run that reached the hub and then exits for another reason (no code page: exit 1, inbox unreadable: exit 3) clears the count too; `--dry-run` never writes or removes state. Both were wrong before (old count survived; dry-run wrote it).
- Pinned: a garbage `since` is never printed (a real date is), a float count is floored. The classifier table rows with a network code now say the code is not read (no status = hub-down).
- Test: scripts/production/live-log.test.js 51 -> 60 tests; 7 mutants of the fixed lines, all killed.
- Not done: a 404/401/403/500 on the first GET (the hub answered, but with a fault of ours) still keeps the count (existing test); nothing installed, the live copy follows after merge.

## 2026-11-10 — live-log hub-down: third review round (f3-1259)

- Public-repo rule: the lines this pull request adds named a machine of the estate twice (script test comment, this file); both are now generic words. The old commit message keeps its word (no rewrite).
- Rule now: the count means hub-down ticks in a row, so any run in which the hub ANSWERED clears it: a success, a 401/403/404/500 on the GET or the PUT (the hub is up and refuses us: exit 1, our fault), and a later step that throws (the top-level catch). Only no answer or a status in the hub-down set (429, 502-504, 521-524, 530) is hub-down. A GET that works followed by a PUT that is hub-down still counts (tested: the 15th tick fails).
- `--dry-run` with the hub down prints "would be N ... not stored" instead of a count the file does not hold.
- Test: scripts/production/live-log.test.js 60 -> 70 tests (8 red before); mutants of each fixed line killed.
- Not done: nothing installed, the live copy follows after merge.
