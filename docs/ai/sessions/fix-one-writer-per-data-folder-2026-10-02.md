## 2026-10-02 — two servers on one data folder no longer break a project: one carries the follows, every project write is one writer

- **What broke (aylmo, 2026-10-02).** The installed di (:443) and a dev stack (:4000) share
  `~/.local/share/di.iiii/data` on purpose. Both read `follows.json`, so both ran a follower for
  `test-desk` (and machine links) into one di.db. Project `test` ended at document_version 809
  with ops 805–819; every write after that was a 500 (`UNIQUE constraint failed:
  project_ops.project_id, project_ops.version`), retried every ~25 s, and `di follows` said only
  `500` while the host moved on to 2586. Cause: the project write lock was in-process only, the
  write was three separate steps (document, ops, version), and SQLite had no busy timeout.
  Measured on origin/dev: 4 writers through 2 servers on one folder, 48 edits → 2–3 answered
  500 in each of 3 runs.
- **One server per data folder carries the follows** (`serverXR/src/follow/lease.js`): a lease
  `follows.lock` (pid, port, host, heartbeat every 5 s). The other server starts no follower and
  no machine link, logs once which pid/port does, and takes over when that pid is gone or its
  heartbeat is 20 s old. `GET /api/follows` and `di follows` on it say so (`carriedHere: false`,
  `carriedBy`). Consequence to know: tabs open on the non-carrying server are not relayed to the
  host by machine links — they are by the carrying one.
- **Project writes are one writer across processes** (`serverXR/src/projectWrite.js`): the
  in-process lock plus proper-lockfile 4.1.2 (new pinned dependency of serverXR; atomic mkdir
  lock with mtime heartbeat and stale takeover); the version check, op append and version bump
  are one `BEGIN IMMEDIATE` transaction that re-checks the base version
  (`projectStore.commitProjectOps`), so a lost race is a 409. The document is staged as
  `document.json.v<N>.pending`, committed, then renamed in; a write cut off between steps is
  finished or dropped under the lock. `PRAGMA busy_timeout = 5000`. Covers POST ops, PUT
  document, the title PATCH and snapshot restore.
- **Healed, never failed again**: ops above a project's version move whole to the new table
  `project_ops_quarantine` (reason + the version it stood at) at startup and inside the next
  write's transaction, logged per project. Rule written in `projectStore.js`: the version is the
  truth; the follow's converge step re-agrees a followed project with its host.
- **The follower stops hammering**: a stream whose write gets a 5xx is left alone 5 s, 10 s … 5 min
  while the rest keeps moving, and its `lastError` is a sentence naming the project, the side and
  the server's words.
- Guards, all red on origin/dev: `serverXR/src/follow/oneDataFolder.test.js` (two real servers on
  one temp folder plus a host: one follower, 48 concurrent edits with 0 × 5xx and max op version
  == document_version, SIGKILL takeover; fixture DB at v809 with ops to 819 → v810 answers 200),
  `serverXR/src/projectWrite.test.js`, `serverXR/src/follow/lease.test.js`, additions to
  `follower.test.js`, `followPlan.test.js`, `scripts/di/followFiles.test.js`.
- **Owed**: space (scene) ops are still guarded in-process only — two servers editing one room's
  scene at once can still race. Both servers on a folder must run a build with this fix; the
  installed di (0.4.16-rigbuilder.14) does not yet, and an older build ignores the lock. The live
  project `test` on aylmo will be healed by its first start on a fixed build (not touched here).
