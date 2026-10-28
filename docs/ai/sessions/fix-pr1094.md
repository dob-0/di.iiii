## 2026-10-28 — the idle sweep trashes and reports; /privacy says so

- #1094 merged with today's dev (no conflicts); the sweep sends idle spaces to the trash and skips reachable ones.
- /privacy and the privacy inventory now state the 30-day idle rule plus the 30-day trash hold, and name `sweep_log`.
- Tested: lint 0 errors, build ok, vitest related 145 files / 1734 tests passed.
