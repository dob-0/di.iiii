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

## 2026-10-07 — brought up to date with dev (merge notes, bug sweep)

- Merged `origin/dev` into this branch; it had fallen 296 commits behind (no rebase, no force-push). Six files conflicted, and each keeps both sides:
  - `docs/ai/known-fixes.md`: both sides appended a row; dev's rows stay in dev's order, then this branch's.
  - `serverXR/package.json`, `serverXR/package-lock.json`: dev's versions (sharp ^0.35.5) plus this branch's one addition, proper-lockfile 4.1.2 and its three dependencies in the lock. The lock differs from dev's by 33 added lines and none removed; `npm ci` in `serverXR/` installs it, and `npm install --package-lock-only` afterwards changes nothing.
  - `scripts/di/ui.mjs` (`followList`): dev's settings lines and indentation inside this branch's "another server carries these follows" head line.
  - `src/wiki/wikiContent.js`: dev's two rewritten lines, then this branch's "TWO di.iiii ON ONE MACHINE" line; `updated` is 2026-10-07 because the article text changed again in this merge.
  - `serverXR/src/follow/follower.js`: both sides declared `refusals` for different things (dev: copies that disagree, a string per stream, set aside for a person to choose; this branch: a wait after a server error, `{ count, until, message }` per stream). Both are kept; this branch's map is now `writeBackoff`.
- One break that git did not report. Dev's project move route (`POST /api/projects/:id/move`, added after this branch's base) calls `withProjectLock(projectId, fn)`, the signature this branch replaced with one that takes a project object. The merge was textually clean, and every move that reached the lock answered 500. Measured on the merged tree before the fix: `projectMoveContracts.test.js`, 5 of 6 tests failed. A move cannot hold the cross-process lock, because it renames the directory the lock file lives in (the lock would travel to the other space and stay there), so it now takes the in-process half only: `withProjectInProcessLock` in `projectWrite.js`, same key as the writes, so it still queues with this server's own writes. Guards: `projectMoveContracts.test.js` (red before, green after) and two new cases in `projectWrite.test.js` (the move queues with a write in both directions; no lock file is left in the directory it renames). With the move given a lock instance of its own, the first new case fails.
- Measured after the merge: 8 files, 168 tests passed, 0 failed (`projectMoveContracts`, `projectWrite`, `projectContracts`, `projectVisibilityContracts`, `httpContracts`, `syncContracts`, `follow/oneDataFolder`, `follow/follower`), and eslint exits 0 on the five files touched by hand. Before the move fix, the wider batch (`serverXR/src/follow/`, `serverXR/src/machines/`, `scripts/di/`, the server contract tests, the store and database tests) was 69 files passed, 1 failed. With this branch's source files taken back to dev's in a throwaway copy, the guards go red: 16 of 43 tests fail in 5 of 6 files, including both `oneDataFolder` cases (no server ever becomes the one that carries the follow; a write at v809 answers 500 where the fixed build answers 200 and v810, the aylmo incident).
- Undone / owed: a project move is guarded in this process only, so two servers on one data folder can still race a move against a write — the same kind of gap as the space (scene) ops listed above. Everything under the 2026-10-02 "Owed" still stands. The full suite was not run here; CI runs it on the PR. Nothing was seen on a real install: the installed di and a dev stack on one data folder, both on this build, is the check still owed by a person.
