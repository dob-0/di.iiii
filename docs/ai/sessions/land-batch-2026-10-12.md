## 2026-10-12 — Batch landing of 13 green PRs that were all BEHIND dev

- One batch branch from `origin/dev` (ffbe0c52), each PR merged `--no-ff` (the proven 2026-09-05 route, PR #368): #855 #877 #862 #863
  #865 #859 #860 #861 #857 #856 #831 #836 #842. Every PR branch was first brought up to date with dev (`gh pr update-branch`), so each
  one's own CI also ran on the current base.
- Two merges conflicted and were resolved by hand, mechanically: #857 against #861 in `docs/ai/known-fixes.md` (two rows added at the
  same line; both kept) and #865 against #862 in 11 workflow files (#865's side taken: `.nvmrc` as the Node source, `timeout-minutes`
  on every job, concurrency; then #862's runner pin `runs-on: ubuntu-24.04` re-applied over every `ubuntu-latest`).
- Not in the batch: #885 (conflicts, in another session's worktree), #852 and #838 (conflicts in 11 agent files / 3 viewer files), #854
  (to main, blocked by its protection rule; #855 is its dev twin and is in here).
- Fold on dev after the merge, as the batch rule says; the PRs' own session notes stay in place for that fold.
- CI on the batch (run 38306321674) was red in build-and-test and node-22-compat on ONE test, `gracefulShutdown.test.js` "exits 0":
  #859's own CI is red on current dev for the same reason — dev's laser SIGTERM handler (60c252fd) re-raises the signal and kills the
  process mid-stop. Fixed here, not by dropping #859: the lasers stop is the awaited `before` step of the orderly stop, one signal
  handler, exit 0; `laserShutdownContracts.test.js` expects the orderly exit (the cube still hears output-off twice first). Measured
  locally with both dependency sets installed: before 1 failed / 7 passed, after 9 passed (one new unit test for `before`). Known-fixes row added.
