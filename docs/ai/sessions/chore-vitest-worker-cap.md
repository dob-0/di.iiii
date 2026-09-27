## 2026-09-28 — vitest capped at half the cores outside CI

- `vite.config.js` `test.maxWorkers: '50%'` when `CI` is unset (vitest 4.1.10 option; default in
  run mode was cores-1 = 15 on aylmo). CI keeps vitest's default. `--maxWorkers` and vitest's own
  `VITEST_MAX_WORKERS` env still override. Documented in `docs/ai/testing.md`.
- Measured on aylmo (i7-11800H, 16 threads) with other agents already loading it (1-min load 17-31
  before each run): one run 98-115 s uncapped vs 121-127 s capped; two concurrent runs 178-179 s
  uncapped vs 170 s capped, 33 vs 19 vitest processes, 1-min load after 46 vs 27. All runs
  569 files / 6302 tests passed except one uncapped solo run: a 5 s timeout in
  `PublicProjectViewer.test.jsx`. CPU package hit 100 C in every run, capped or not — the cap
  lowers oversubscription, it does not fix the heat ceiling.
