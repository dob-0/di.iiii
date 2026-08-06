---
description: Fold staged docs/ai/sessions/ notes into PROGRESS.md/CURRENT.md and sweep worktrees
allowed-tools: Read, Bash
---

Run `npm run land` — the one command that writes `CURRENT.md`. See
`docs/ai/sessions/README.md` for why this exists and what it does.

Preconditions the command itself enforces (it refuses otherwise, loudly):
- You must be on `dev`, tree clean.
- There must be at least one note under `docs/ai/sessions/` (besides `README.md`) —
  otherwise it says so and does nothing.

What it does, in order: folds every note's full text into `PROGRESS.md` (newest at
top), rewrites `CURRENT.md`'s `## Last session` to a title list pointing at
`PROGRESS.md`, deletes the note files, runs `npm run state:sweep` (removes only
worktrees confirmed merged + clean + not live — this is the enforced cleanup moment,
not a courtesy), and commits. **It does not push** — review the commit first.

Steps:
1. `!git branch --show-current` — confirm you're actually on `dev`. If not, stop and
   say so; don't switch branches on the user's behalf without asking.
2. `!git status --short` — confirm the tree is clean. If not, stop and ask how to
   handle the uncommitted changes (commit/stash/discard) rather than guessing.
3. Consider running `node scripts/session-land.mjs --dry-run` first to preview the new
   `CURRENT.md` "Last session" section — it's cheap and touches nothing.
4. `!npm run land`
5. Report what landed (which notes, how many worktrees were swept) and remind the user
   the commit is local-only until pushed.
