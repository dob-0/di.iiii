# fix/di-held-port-all-commands-2026-11-19

## Task
Follow-up of #1306: `di status`, `di restart`, `di update` and `di new` still trusted any health answer on the port, so another program's server was treated as this install's.

## Changed
- `scripts/di/cli.mjs`: `heldByStranger`, `ownAlive`, `sayNotRunning`; used by status, restart, update, new.
- `scripts/di/heldPortCommands.test.js` (new); `scripts/di/oneAddressPrinted.test.js` writes the pid file for its in-process server.
- `docs/ai/known-fixes.md`: entry 2026-11-19.

## Proof
`npx vitest run scripts/di` → 759 passed; with `ownAlive` set back to `alive`, 2 of 3 new tests fail.

## Not done
Docker installs keep the old reading; macOS/Windows fall back to the old answer where /proc is missing; `di save` reads data directly (no check needed).
