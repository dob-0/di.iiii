## 2026-10-07 — a follow carries a project's trash, restore, rename and move (item 6a)

- Design first, in `docs/architecture/SPEC_follow.md` "A project trashed, restored, renamed or moved": a base (the
  last agreed state, Unison's archive) tells which side changed; host wins; a project is trashed here only from the
  host's trash row, never from an absence; a pass never trashes every project this copy holds, nor more than 5.
- Space settings (label, isPublic, front door) were already carried host to this install since 2026-10-05; measured here.
- Code: `serverXR/src/follow/followProjects.js` (the rules, no I/O) and `follower.js` (carries them through each
  install's own routes); a project PATCH, trash, restore and move wake the space's follow (`projectRoutes.js`);
  `di follows` prints what was not carried (`scripts/di/ui.mjs`).
- Carried: trash (to this install's trash, restorable) and restore host to follower; title and slug both ways (host
  wins when both changed); made private host to follower; a move between two spaces both followed from the same host.
  Not carried, said in `di follows`: a trash, move or visibility change made on the follower (the host's gates are
  owner-or-admin, a sync key is an editor); a project made public again.
- Tests: 17 rule tests, 10 new two-server tests plus one existing test rewritten to wait for the pairing instead of
  racing the follow's next pass (#760). Full follow integration file 46/46 twice, project contracts 147/147.
- Measured on loopback: each kind crosses in 8–38 ms once a follow is settled. A machine-to-machine run is owed.

## 2026-10-14 — refreshed onto dev

- Merged `origin/dev` (84fc193c). Six conflicts, all both-intents: `follower.js` (project-life carry + dev's slug carry and `chase.noteAnswered()`; both `projects` and `slugs` in the state), `projectRoutes.js` (dev's `withProjectLock` around the rename's document write + this PR's `tellFollows`), `ui.mjs`, `followFiles.test.js`, `followIntegration.test.js`, `known-fixes.md` (both sides kept).
- The merge made one existing follow test fail 4/4 in a full-file run: a stopped follow applied the edit its parked read returned. Fixed in `stop()` and after the read (known-fixes entry).
- Tests (`serverXR/src/follow`, `scripts/di`, `projectContracts`): before 574/574 (44 files); after 720 passed, 4 failed (724) — all `scripts/di/oneAddressPrinted.test.js`, which fails identically on origin/dev in this container (`*.localhost` names). UNVERIFIED: that file's behaviour on a real machine.
- UNVERIFIED: slug carry and project-life carry running together on a real two-machine follow (only loopback tests).
