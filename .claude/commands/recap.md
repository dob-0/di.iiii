---
description: Recap this session into docs/ai/sessions/ (repo-local — see docs/ai/sessions/README.md)
allowed-tools: Read, Edit, Write, Bash
---

Recap this session. This repo-local command overrides the generic
`~/.claude/commands/recap.md` — that one writes straight into a session-state file,
which is exactly the habit that raced badly here: `CURRENT.md` was rewritten 22 times
in one day from 3 different branches, and three separate sessions' real notes were
silently destroyed by a concurrent rewrite before their branch ever merged. See
`docs/ai/sessions/README.md` and `docs/ai/golden_rules.md` for the full story.

**CURRENT.md is written by exactly one thing: `npm run land`, run on `dev` at merge
time. No other command may write it.**

Context:
- `!git branch --show-current`
- `!npm run state` — live branch/worktree/promotion facts. **Never re-derive these by
  reading `git log` yourself and writing what you find.**
- `!git log --oneline -10`

Steps:

1. **If you are on `dev` or `main`:** there is nothing of yours to recap into a
   session note — those branches don't carry one. Run `npm run land` instead (folds
   any staged `docs/ai/sessions/*.md` into `PROGRESS.md`/`CURRENT.md` and sweeps
   worktrees). If `land` says there's nothing to land, you're done.

2. **Otherwise** (any feature/fix/chore branch): write or append to
   `docs/ai/sessions/<branch-slug>.md`, where `<branch-slug>` is your branch name with
   every `/` replaced by `-` (e.g. `chore/sync-safety-rescue` →
   `chore-sync-safety-rescue.md`). Read `docs/ai/sessions/README.md` first if this is
   your first recap on this branch — it has the exact format.
   - Append across a session; don't touch anyone else's file (each branch has its own
     path precisely so two sessions can never collide on this).
   - One `## <date> — <title>` heading, then one sentence per bullet — concrete, no
     filler. Judgment calls, decisions, and what's still open are what this is for.
   - **Never write a commit SHA, or "N ahead"/"N behind".** Those are derived facts;
     `npm run state` reports them live. A note that repeats them just goes stale.
   - If something is still genuinely undone, say so plainly — that's exactly the kind
     of note that used to get lost.
   - Do **not** touch `CURRENT.md` on a feature branch — `docs:ai:check` refuses a
     branch whose `CURRENT.md` differs from `origin/dev`.

3. Before finishing: `npm run docs:ai:check` must pass (enforces the session-note
   requirement, the CURRENT.md-untouched rule, the 50-line limit on CURRENT.md itself,
   and the SHA/branch-position ban). Fix and recheck, don't eyeball it.
