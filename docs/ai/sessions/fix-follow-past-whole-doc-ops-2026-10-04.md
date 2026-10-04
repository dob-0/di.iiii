## 2026-10-04 — a follow steps past whole-work ops once the copies agree

- **Seen.** aylmo following dev.diiii.xyz, space `wcc`: every project had `replaceDocument` ops, equal on both
  sides, and `di follows` said "one side replaced a whole scene" for good; cursors stood at `{13, null}` in a log of
  124.
- **Reproduced** (two real servers, `followIntegration.test.js`): a whole-work op with no opId in each log (what an
  older log holds) pinned the cursor and the message never cleared. Whole-work ops that do carry an opId did NOT
  pin it on the base branch (that case passed before the fix and is kept as a guard) — so hayfilm, whose ops have
  ids, cleared by itself. This is the best-supported cause, not proven on the wcc data itself (that data was not
  opened, by rule).
- **Fix.** `followPlan.accountedThrough` passes whole-work ops; `follower.js` compares the copies when it sees one
  and keeps `disagree` per stream (names the project, re-checks every tick, never writes); status is also built
  before the room's park. Host-wins converge unchanged.
- **Measured.** Follow folder 76/76 pass (before: 3 of the 4 new tests red); `test:server-contracts` 193/193;
  eslint clean on the four changed files.
- **Owed.** Run on aylmo against dev.diiii.xyz (real surface). `PUT /api/projects/:id/document` does not call
  `nudgeFollow`. `replaceScene` on the room is covered by the same code (scene stream has a documentPath) but has no
  integration test of its own.
