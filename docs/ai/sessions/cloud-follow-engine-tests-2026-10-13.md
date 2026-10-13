## 2026-10-13 — follow engine: a lost-op race, a converge that erased an edit, and a save kept only in memory

Cloud run (scheduled). Scope: `serverXR/src/follow/follower.js` and one new test file; no server route,
no client, no look changed.

**The flake.** `npx vitest run followIntegration` (serverXR), 37 tests, ~290 s a run:

| code | runs | result |
| --- | --- | --- |
| origin/dev (before) | 5 | 5 green, 37/37 each — the flake did NOT reproduce here |
| this branch (after) | 5 in a row | 5 green, 37/37 each |

Cause, by trace only (UNVERIFIED as the flake's cause, since it never failed in these runs): the two
named failures ("carries an edit made on the host", then "never applies the same op twice" counting 3
edits instead of 4) are what audit F9 predicts. `GET /api/spaces/:id/ops` reads the ops and THEN the
version (an async meta read); the test writes on the host straight after the follow starts, and a write
landing between the two reads answers `ops: []` with `latestVersion` 1. The follower moved an empty
read's cursor to `latestVersion`, so op 1 was never read by anyone. Fixed in the follower: an empty read
never moves a cursor (`runStream`'s cursor update).

**New tests** — `serverXR/src/follow/followRaces.test.js`, an in-process fake install with serverXR's
read order and hooks that land an edit exactly in a gap. Before the fix 0/3 passed (all three red at
their own assertion, run against an origin/dev worktree); after, 3/3, five runs in a row.

- **C2 lost-op race** (audit F9) — an edit made between the op read and the version read reaches the host.
- **C1 convergence** (audit F12) — an edit made between the op read and the document read is not erased by
  the host-wins converge, and both copies end equal. Fix: `converge` is skipped (flags kept) when this
  copy's document version is not the version its log was read at.
- **C3 cursors kept in memory** — a failed `onSave` is retried on the next tick; before, the snapshot was
  marked saved before the write ran, so a quiet room kept its cursors only in this process.

The C1/C2/C3 labels came with the task; no file in the repo defines them. Mapping them to F12/F9/the
failed-save case is this run's reading — UNVERIFIED against whoever wrote them.

Also green: the rest of `serverXR/src/follow` (12 files, 102 tests); eslint on the folder.
Not run: `npm run test:server-contracts` and the full suite (no server or client file changed); no real
two-machine follow.

Next: fix the read order in the ops routes themselves (version before ops, or `latestVersion` = max of
both) so browsers using `useLiveSync` cannot skip the same op — not done here, it is outside this task.
