## 2026-10-02 — serverXR refuses a database inside the checkout (no more stray di.db)

- 24 checkouts on aylmo each ran serverXR with the default relative `DATA_ROOT`, so work was saved into `<checkout>/serverXR/data/di.db` where nobody else sees it. Now `serverXR/src/dataRootGuard.js` (called from `index.js` after dotenv) exits 1 when `DATA_ROOT` is unset or relative, the repo root has a `.git`, and it is not under test. `DI_SCRATCH=1` prints `SCRATCH database at <path>` and goes on. On aylmo the supported start is `di-dev up <tree>` (di-atlas tools/di-dev).
- `scripts/dev-stack.mjs` applies the same rule before spawning (scratch runs get `~/.cache/di-dev/<tree>/data`); vite stays on `strictPort`, and no process is killed by pattern. `scripts/self-host.mjs` writes an absolute `DATA_ROOT`; `serverXR/.env.example` no longer sets one.
- Installed `di`, Docker (`DATA_ROOT=/data`), cPanel (absolute, required by `write-server-env`; prebuilt release has no `.git`) and tests are unchanged. Guard: `serverXR/src/dataRootGuard.test.js`.
- Owed: the work that lives only in the 24 stray databases (backed up in `~/di-backups/stray-dev-dbs-2026-10-02/`) is not yet moved into the main tier.
