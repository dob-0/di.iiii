## 2026-11-19 — Monitor by account: sign in and see all your machines (ledger N5841)
- Owner's rule: signed in, the Monitor shows all your machines; another person who signs in sees their own; not signed in, the local copy (this machine only).
- Dev tier: `POST /api/monitor/report` now takes a terminal login (`di login`) from ANY signed-in account, not only the owner (no ledger asks from non-owners; per-person host and count limits already exist). New `GET /api/monitor/mine` returns only the caller's own machines. The dev Monitor page and stream list only the owners' machines, never another person's.
- Local tier: `serverXR/src/monitorAccount.js` reads the user's own `~/.config/di/credentials.json` (dev entry), asks dev for `/api/monitor/mine` (4 s timeout, cached 15 s) and adds those machines to the snapshot marked `via: 'dev'`; it never replaces a machine this server holds. The token goes only to dev and is never returned or logged. States: ok, signed-out, expired, offline; the snapshot carries `account`.
- Page: the Machines box says whose machines it lists (one line per state).
- `scripts/monitor-join.sh <host>`: a machine signs in once and starts the 30 s report timer; a `di-ask` window runs it.
- Tests: monitorAccount.test.js (new), monitorRoutes.test.js, monitorHub, page test: 69 files, 737 passed on di-work; lint 0 errors.
- Not done: nothing is live end to end until this is merged and dev is deployed (today dev has no `/api/monitor/mine`, so a signed-in local Monitor says "could not be reached"). di-work and the Mac have no di yet.
- Stacked on `feat/monitor-devices-credits-2026-11-19` (PR #1323): merge that first.
