## 2026-10-09 — serverXR stops in order on SIGTERM; update snapshots after the stop; health reads the database

- serverXR had no SIGTERM/SIGINT handler: `docker stop` or `systemctl stop` ended it mid-write. `serverXR/src/gracefulShutdown.js` now stops accepting, clears the sweep timers, runs `PRAGMA wal_checkpoint(TRUNCATE)`, closes SQLite and exits 0; a 10 s hard deadline exits 1 and logs why.
- `serverXR/Dockerfile` names `STOPSIGNAL SIGTERM`; `docker-compose.yml` gets `init: true` (Docker's bundled init, no unpinned apk package) and `stop_grace_period: 15s`. Base image digests unchanged. The root Dockerfile is nginx, untouched. Docker was not usable without sudo on this machine, so the image build is untested.
- `di update` now stops the server before the safety snapshot, and `snapshotData` writes each `.db` with `VACUUM INTO` (one consistent file, no -wal/-shm) instead of copying a live WAL folder.
- `/api/health` runs `SELECT 1`; a failing read answers 503 with `ok:false`.
- Tests: `serverXR/src/gracefulShutdown.test.js`, `scripts/di/updateSafety.test.js`, `serverXR/src/routes/statusRoutes.test.js`.
