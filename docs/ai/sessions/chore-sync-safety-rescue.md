## 2026-08-06 — Sync-safety pass: rescue, seal, and the structural fix

Full plan at `~/.claude/plans/humming-wiggling-wozniak.md` (not tracked in-repo). Built
on PR #94's `repo-state.mjs` tooling rather than duplicating it.

- Recovered three sessions' `CURRENT.md` notes that a concurrent rewrite had silently
  destroyed before their branch merged (found via `git fsck --dangling`) — folded into
  `PROGRESS.md`. Re-opened one still-genuinely-undone TODO that was lost with them (the
  Open Space scene zip, never imported).
- Rescued 263 uncommitted lines sitting in a `/tmp` worktree with no backup → pushed as
  `fix/inscription-mark-server`. Pushed two branches that existed only on this disk
  (`feat/timeline-core` had no upstream at all; `feat/raw-studio-node` was mistargeting
  `origin/dev`, so a bare push from it would have landed straight on `dev`).
- Built and verified a guard (`checkSafeSource` in `space-sync-vendor.mjs`) against the
  8-copies-of-the-vendoring-tool hazard — confirmed live, not theoretical: triggered the
  real downgrade once while testing the unguarded old copy, fixed it, then verified the
  guarded version refuses the same operation. Added `--release` (write + bump
  `minEngine` + commit + push per linked repo in one command) — not run for real yet,
  waiting on this branch merging so a real `dev` checkout can run it.
- Worktrees 21 → 10 (removed 8 confirmed merged/stale, one of which turned out to hide
  a third lost session), local branches 55 → 17 (deleted 38 confirmed fully-merged or
  patch-equivalent — 2 looked like garbage by branch name but had real unmerged work,
  caught by checking each individually rather than trusting the heuristic).
- This session-notes protocol itself (`docs/ai/sessions/`, `docs:ai:check` enforcement,
  the `active_branch: dev` literal check) is the structural fix for the one *confirmed*
  loss mechanism — everything above was rescue/cleanup around the edges of it.

## 2026-08-06 — `npm run land`, `repo-state.mjs` live-process detection

- `repo-state.mjs`/`repo-state-lib.mjs` (extends PR #94, doesn't duplicate it):
  `classifyWorktree` (LIVE > UNPUSHED > UNMERGED > STALE > GONE, via `/proc` scan +
  `git cherry` for squash-merge-aware merge detection), `--brief`/`--sweep`/`--json`.
  Real bug caught building this: the first live-process pattern matched `vitest run`
  (one-shot), so a test run in progress got misidentified as a live dev server —
  happened for real, not hypothetical, fixed and regression-tested.
- `session-land.mjs`/`session-land-lib.mjs` (`npm run land`): folds `docs/ai/sessions/`
  notes into `PROGRESS.md`, rewrites `CURRENT.md`'s Last-session to a title list
  pointing there (full prose never goes in CURRENT.md — the only way to guarantee the
  50-line budget regardless of how much landed in one batch), deletes the notes, runs
  the worktree sweep, commits (not pushes). Verified end-to-end in an isolated clone
  with two fake notes — folding, CURRENT.md rewrite, file deletion, sweep, commit all
  confirmed correct.
- Second real bug caught testing `land`: `execFileSync`'s default stderr inheritance
  leaked "fatal: no upstream configured" straight to the console for an expected,
  already-handled failure (probing an unpushed branch) — in both `repo-state.mjs` and
  `space-sync-vendor.mjs`'s `git()` helpers, pre-existing in PR #94's code, not just
  this branch's additions. Fixed both.
- Dogfooded the CURRENT.md-untouched rule on this exact branch: my own earlier commits
  had hand-edited `CURRENT.md` directly, in violation of the rule being written.
  Reverted rather than grandfathered — see the commit for the full story, including a
  second bug this surfaced (`origin/dev...HEAD` vs `origin/dev` diff form).
- `.claude/commands/land.md` added; `recap.md` (from PR #94) rewritten to write session
  notes instead of editing `CURRENT.md` directly, which is now a `docs:ai:check`
  violation. `docs/ai/golden_rules.md` and `docs/ai/parallel-agents.md` updated to
  match — the worktree-location convention (`.claude/worktrees/`, not `../di.iiii-*`)
  is now stated as the rule, not "either is fine".

**Still open:** CI self-checks in the 3 linked repos so engine drift can fail loudly
instead of stalling silently (`space:sync:release` exists but hasn't run for real —
waiting on this branch merging), and the `di-spaces` reconciliation. Consolidating to
one canonical di.iiii checkout stays blocked on `di.iiii-algomerge`'s active work.
