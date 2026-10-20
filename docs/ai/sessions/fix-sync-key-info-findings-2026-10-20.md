# fix/sync-key-info-findings-2026-10-20

## Goal

Close the info findings I1–I5 of the round-3 security review of #811 (sync keys, `manage` scope). L1/L2 were
fixed in #1035. Source: the owner's reports folder, `pr811-review-r3.md` (2026-10-20).

## What changed

- **I1 (code):** `serverXR/src/index.js`, `/api/projects/:projectId` gate: a request whose second key did not
  resolve (`authState.reason === 'second-key'`) answers 401 before the project is looked up — the same body for a
  private project, a public one and an id never made. Before: 404 on a private project, 401 otherwise.
- **I2 (code):** `serverXR/src/routes/projectRoutes.js`, move route: `404 target space not found` only for an admin;
  anyone else gets the 403 a space they may not use gets, word for word. `managesTo` guards a missing target.
- **I3 (docs):** `follower.js` comment and the 2026-10-07 session note said `X-Di-Sync-Key-Also` header; they now say
  `alsoSyncKey` in the JSON body, as the code reads it. The spec already said so. The description of #811 itself
  still names the header: editing a merged PR's text was refused by the auto-mode guard (External System Writes).
- **I4, I5 (notes, no code):** `docs/architecture/SPEC_space_sync_keys.md` §13.3 (case-sensitive `MOVE_ROUTE` fails
  closed), §13.7 (undo only inside the 30-day trash window, with the purge mechanics; a key is a bearer secret bound
  to nothing), §13.9 round-3 table, §13.10 owed rows.
- API catalogue note for the move (`catalogue/entries/projects.js`), known-fixes entry.

## Tests

- Before the fix (origin/dev bd4d8908 + the new tests): 3 failed / 21 skipped — I1 `case 1: {"error":"Project not
  found."}: expected 404 to be 401`; both I2 tests `{"error":"target space \"no-such-space-i2\" not found"}: expected
  404 to be 403`.
- After: the 3 new tests pass. `syncKey*` 36/36 (33 before + 3 new); with `httpContracts`, `src/follow*`,
  `src/routes`, `catalogueContracts`: 49 files, 632/632. `syncKeyMoveRace` 3 runs: 3/3 each time.
- eslint on touched files: 0 errors (2 old warnings in index.js); `check-agent-docs` and `check:fallback-patterns` pass.

## Not done

- No timing padding: the move still reads the target's meta before refusing (one file read; not measured).
