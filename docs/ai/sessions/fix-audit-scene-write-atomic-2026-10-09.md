## 2026-10-09 — a scene write is now one step across servers and crashes, like a project write

- Audit 2026-10-09 data F1: scene writes (POST ops, whole-scene replace, inscriptions) were three separate commits
  (scene.json, ops, version) behind an in-process lock. Two servers on one data folder: 10–61 answers of 500 per run,
  scene.json holding objects no acknowledged write made; a crash between ops and version left the space refusing every
  write after a restart.
- Fix reuses the project path of PR #728: its proper-lockfile lock moved unchanged into `serverXR/src/dataFolderLock.js`
  and is now taken by both `projectWrite.js` and the new `serverXR/src/sceneWrite.js`. A scene write stages
  `scene.json.v<N>.pending` (fsynced), commits op append + version in one BEGIN IMMEDIATE transaction
  (`spaceStore.commitSceneOps`), then renames it in. Startup and every write finish or drop what a stopped write left;
  ops above the version go to the new `space_ops_quarantine` table. The follows lease (`follow/lease.js`) is a different
  thing (who runs the follower) and was not the right lock to reuse.
- Measured with the audit's own two-server script, 3 runs each: before 5xx = 61 / 10 / 13; after 0 / 0 / 0, with
  scene_version = max op version = op rows = scene objects = 100 acknowledged writes.
- Still owed: a reader on another server sees the pre-crash scene until that space's next write (same as projects);
  a scene.json already ahead of its log from the old code cannot be detected; an older build on the same folder ignores
  the lock; the sandbox revive path in index.js still writes scene.json and version 1 in two steps (a fresh space, no ops).
