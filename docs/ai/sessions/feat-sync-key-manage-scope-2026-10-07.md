## 2026-10-07 — an opt-in `manage` scope on sync keys, so a follower's trash, privacy and move reach the host

- Owner's yes: 2026-10-07, ledger row N204. Stacked on PR #800 (a project's life crosses a follow, host to follower).
- Design first, DRAFT for security-auditor review: `docs/architecture/SPEC_space_sync_keys.md` §13 and
  `docs/architecture/SPEC_follow.md` "With a `manage` key".
- Scratch servers and the integration harness only; no dev.diiii.xyz, no installed di, no real keys.
- Built: `scope` column on `space_sync_keys` ('edit' default), `sync_key_actions` table (the key log),
  `syncKeyActions.js` (limits 10/h 30/d trash and move, 30/h 100/d private; counted from the log under a per-key
  lock), `canManageProjectsState` in index.js used by exactly the trash, private and move gates;
  `X-Di-Sync-Key-Also` for a move (second manage key, not added to the editor scope). New routes:
  `GET /api/sync-keys/self`, `GET /api/spaces/:id/sync-keys/actions`, `POST /api/spaces/:id/sync-keys/:keyId/undo`.
  Follower: asks its key's scope every 10 min; `planProjects({ manageThere })` mirrors guards 1-3 the other way;
  base now keeps `visibility`; `moveThere` uses the other follow's key (index.js `sameHostSides`). CLI:
  `di invite SPACE --manage | --actions | --undo KEYID`; `di follows` shows `key: manage|edit`. Wiki entry updated.
- Tests: `syncKeyManage.test.js` 15/15 (one real server, auth on); followProjects 26/26; contracts 199/199;
  follow integration 53/53 twice (7 new, ~215 s each); with the carry switched off 4 of the new integration tests fail.
- Pre-existing, not this branch: `scripts/di/openFile.test.js` "di mcp from an install" fails on #800's branch too.
- Owed: an interface panel for sync keys (mint with the manage checkbox, key log, undo) — on a hosted di.iiii a
  manage key can be minted today only from a signed-in session calling the API; security-auditor review; a real
  two-machine run.
- Round 2 (independent security review, verdict "do not merge"; PR back to draft): C1, H1, M1, M2 and L1–L4 fixed,
  manage keys 90 days with a 14-day warning, spec §13 rewritten to what the code holds (resolution table §13.9).
  The reviewer's six tests are in the suite (`syncKeyManage.review.test.js`). Results: 23/23 key suites,
  contracts 199/199, follow integration 54/54 on one run and 53/54 on the other; the one failure is the
  pre-existing "start from now" flake, which also fails on #800's branch (2 of 5 runs there, 1 of 5 here).
