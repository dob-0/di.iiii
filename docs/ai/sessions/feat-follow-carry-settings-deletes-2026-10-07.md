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
