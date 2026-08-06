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

**Still open, not done this session:** `npm run land` (the command that folds these
notes into `PROGRESS.md`/`CURRENT.md` and sweeps worktrees at merge time — referenced
by this same protocol but not yet built), `repo-state.mjs` live-process/merge-status
extensions, CI self-checks in the 3 linked repos so engine drift can fail loudly instead
of stalling silently, and the `di-spaces` reconciliation. Consolidating to one canonical
di.iiii checkout stays blocked on `di.iiii-algomerge`'s active webcam-feature work.
