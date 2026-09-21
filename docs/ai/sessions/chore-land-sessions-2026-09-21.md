## Landing 21 notes so the dev tier can deploy again

The dev deploy had been failing since 2026-09-20 — not on code. `deploy-vps-dev.yml`'s
`land` job folds the pending session notes in its own workspace, that fold rewrites
CURRENT.md's "Last session" with one bullet per note, 21 notes pushed the file to 62
lines against the 50-line limit, `docs:ai:check` failed, and `build-and-push` + `deploy`
were **skipped**. A skipped job is not a red one, so three runs in a row read as
"failure" on the test job while the tier quietly served the previous build.

Done here:
- folded the 21 notes into PROGRESS.md and CURRENT.md (the same
  `session-land-lib.mjs` functions `npm run land` calls, without its worktree sweep —
  other sessions hold worktrees in this tree)
- rewrote "Last session" as six grouped lines instead of 21 bullets: 46 lines, under
  the limit with room for the next fold
- fixed three lines that still named `staging.di-studio.xyz`, retired 2026-09-16 —
  the lanes line, the fold note, and the `git push origin dev` comment now say the
  dev tier

This unblocks the dev deploy and clears the same docs gate on a dev → main promotion,
which is what it was opened for.
