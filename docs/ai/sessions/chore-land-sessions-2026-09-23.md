## 2026-09-23 — folding nine notes by hand again, PR #542's `land` job hit the same GH006

- After PR #542 (`land/batch-2026-09-23`, merged to `dev` at 288d69c7) the dev deploy's
  `land` job ran, folded correctly, and could not push — `GH006: Protected branch update
  failed … 2 of 2 required status checks are expected`, caught, warned, `exit 0`, deploy
  still GREEN. Exactly [[reference-dii-land-job-blocked]]'s shape, third time running
  (09-21, 09-22, now).
- Folded by hand in a fresh worktree off `origin/dev`, `session-land-lib.mjs`'s three
  functions called directly (`foldNotesIntoProgress`, `buildLastSessionSection`,
  `replaceLastSessionSection`, notes read as an array of STRINGS), mirroring
  `scripts/session-land.mjs`'s order exactly — no worktree sweep (out of scope for a
  fold done from a disposable worktree, not the owner's real checkout). Eight notes:
  `chore-land-sessions-2026-09-22.md`, `docs-sentences-that-lie.md`,
  `feat-bar-carries-project.md`, `feat-desk-returns-to-project.md`,
  `feat-one-project-list.md`, `fix-first-room-traps.md`, `fix-one-name-per-tool.md`,
  `land-batch-2026-09-23.md`. Note files deleted after folding.
- A ninth note joined after PR #544 (the light show travels with its space) merged while
  this PR waited: dev merged into this branch, `feat-show-travels-with-space.md` folded
  into `PROGRESS.md` and prepended to the Last session list. That made `CURRENT.md` 50
  lines, at the cap, so the 09-22 fold's own title line was dropped: 49 lines.
- Fixed the two stale `CURRENT.md` lines the `docs-sentences-that-lie` note flagged as
  owed (it could not write them itself — `docs:ai:check` refuses a `CURRENT.md` that
  differs from `origin/dev` on a feature branch): the aylmo install line named
  `0.4.7-shelves.2`, confirmed stale by `di status` (read-only) at
  `0.4.16-connect.2`, packed 2026-09-23; and the Follow line said "carries NO assets
  yet", stale since `serverXR/src/follow/assets.js` shipped 2026-09-20 — replaced with
  what still isn't carried (space-scene files, legacy uuid-id files) per the note's text.
- **This note is next leftover, by construction** — the gate demands a session note for
  the branch that does the folding, so `dev` still sits at exactly one note after this
  lands, same as every hand-fold before it. The real fix (bypass or PR-based push for the
  `land` job) is still the owner's call, still not done.
