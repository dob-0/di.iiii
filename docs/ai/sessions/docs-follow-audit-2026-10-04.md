## 2026-10-04 — follow line audited: 20 findings, seven shown by a run

- Read-only audit of the follow engine, its routes, the sync-key check and the `di follow` CLI; no code changed. The report is `docs/ai/audits/follow-audit-2026-10-04.md`.
- Shown by a run against two real servers: a project made on the follower never reaches the host; a project id that also exists in another local space is joined to the host's project of that id (private work leaks both ways); two accepted 6 MB edits stall a stream with 413 forever.
- Shown on the pure modules: the host's copy overwrites a newer local one; a corrupt `follows.json` is read as empty and the next `di follow` drops every other follow and its key.
- Owed: runs on an auth-on host (shelf routes outside a sync key's space, a dead key accepted on a public space) and controlled-interleaving tests for the cursor and converge races.
