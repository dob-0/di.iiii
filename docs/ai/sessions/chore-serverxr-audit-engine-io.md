## chore/serverxr-audit-engine-io

Clears the CI dependency audit (`npm --prefix serverXR audit --production --audit-level=high`) that failed every run on 2026-09-30.

- Reproduced in `serverXR/`: engine.io 6.6.0-6.6.9 HIGH (GHSA-2gc4-cqfq-p2gv); qs 2.2.5-6.15.3 moderate (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). Exit 1.
- `npm ls`: engine.io is pulled by socket.io 4.8.3 (its range already admits the fixed 6.6.11); qs by express 5.2.1 and body-parser 2.3.0.
- Command that cleared it: `npm audit fix --package-lock-only --omit=dev` (no `--force`). Lockfile-only.

| package | before | after |
|---|---|---|
| engine.io | 6.6.9 | 6.6.11 |
| qs | 6.15.3 | 6.16.0 |
| socket.io | 4.8.3 | 4.8.3 (unchanged) |
| socket.io-client (root, `^4.7.0`) | unchanged | unchanged |

- engine.io 6.6.11 also drops the `base64id` dependency (visible in the lockfile diff).
- No client bump: this is a patch release of the server transport, same Engine.IO protocol revision (v4) and same socket.io-client range; socket.io was not touched.
- After: `npm --prefix serverXR audit --production --audit-level=high` prints "found 0 vulnerabilities", exit 0.
- Targeted tests (`vitest run ... --maxWorkers=2`, after `npm ci`): `serverXR/src/socketHandlers.test.js`, `httpContracts.test.js`, `meshHub.test.js`, `src/hooks/useSpaceSocket.test.js`, `src/project/hooks/useProjectPresence.test.jsx`: 5 files, 135 tests, all passed. Full suite runs in CI only (aylmo fan fault).
- Local note: on aylmo npm timed out against the registry until `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000` was set (curl was fine). Workaround only; not a repo change.
