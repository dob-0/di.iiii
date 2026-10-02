## 2026-10-02 — `di` opens the browser again when di.iiii is already running

Owner: "we need one command everyone will remember, if by mistake they close the browser".
`di` (bare) and `di up` printed "already running — URL" and opened nothing when the server was up — the
usual case after closing the tab. `cmdUp` now opens the public URL there too, unless `--no-open`
(all internal restarts pass it). `di open` already did this; now the remembered word does too.

- Guard: `scripts/di/reopen.test.js` — 2 tests, fail on the old code, pass now.
- `lan.test.js` source-order check updated to the new layout (same order rule).
- Wiki `di-cli-local`: "Type di again" line. known-fixes row.
- Tests: `vitest run scripts/di/` 326 passed, 1 failed — `openFile.test.js` "di mcp … release version", which
  fails the same on dev 170340f5 in this worktree (not this change).
- Not done: seen on Windows/macOS (the opener is `start` / `open`, unchanged); after a reboot di does not
  start by itself — `di` starts it (no autostart for the main server; owed if wanted).
