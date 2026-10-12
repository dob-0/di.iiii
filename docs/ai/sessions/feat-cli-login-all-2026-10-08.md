## 2026-10-08 — `di login`: the three lanes joined in one branch

- Joins `feat/cli-login-2026-10-07` (server), `feat/cli-login-terminal-2026-10-07` (terminal) and `feat/cli-login-page-2026-10-07` (the `/device` page) on current dev (a579b56a). One conflict pair, the page's `/device` next to dev's `/shoot` in `src/RootApp.jsx` and `src/utils/spaceRouting.js`: both kept; the result adds only the login lines (diffed against dev).
- Measured: a scratch end-to-end run of the three lanes (36 of 37 checks; the one failure was the test script reusing an id) — report `~/di-health/cli-login-e2e-2026-10-08.md`; on this branch 11 test files, 592 tests pass (vitest, 03:36).
- Changed after that run, the owner's word 10-08: `--to https://host/some/path` (or with a query/fragment) is now refused with a message instead of being cut to the host; test written first and seen failing (the old code made a real request).
- Owner's decisions 10-08: a terminal key may create spaces (kept, matches the spec); the rate limits stay (10 codes / 10 min and 10 answers / min per address).
- NOT validated: the real GitHub sign-in round trip back to `/device`, the owner's screen, a phone width, Windows file modes, Taron's machine. Nothing was run against dev.diiii.xyz.
