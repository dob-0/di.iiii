## 2026-11-26 — show desk tools: mirrored moving-bar pairs, tilt flip, looks loader

- Moved three tools that lived only in a show report folder into `scripts/show/`: `mirror_sync.py`, `flip_truss_tilt.py`, `live_load.mjs`, with `scripts/show/desk-tools.test.mjs` (synthetic fixtures, loader against a throwaway offline desk from `createDesk`).
- Rule behind them: both bar trusses hang the same way and tilt above 32768 turns a bar toward the left wall, so the mirror of (pan, tilt) is (65536 - pan, 65536 - tilt); equal left/right values send one side into its own wall (owner N7020, N7024).
- Generalised: the pair list comes from presets units (`L<n>`/`R<n>` default, `--left/--right` options); the desk base URL is an option; no production names in code.
- Golden check, local only, on the private show files: 28 of 28 and 27 of 27 looks identical to the looks the tool made that night.
- Not tested: against a live desk (never touched from this branch); full repo test suite.
