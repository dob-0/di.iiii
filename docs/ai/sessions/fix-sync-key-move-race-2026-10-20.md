## fix/sync-key-move-race-2026-10-20: #811 round-3 findings L1 and L2

- L1: key move and key trash re-read the project's space inside the key lock; the loser answers 409 `project_moved` and is logged as refused.
- L2: `keyMoveWidensAccess` logs the internal error and returns a fixed text.
- Tests first: `serverXR/src/syncKeyMoveRace.test.js`; on origin/dev 2 of 3 failed (race 200+200, driver text in the 403); after the fix 3/3, race test 10 of 10 runs.
- Not covered: the owner-move vs key-trash race is not deterministic in a black-box test (the case only asserts that both never apply); an owner's (non-key) move is not changed.
