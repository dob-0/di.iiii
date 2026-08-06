---
description: Recap this session into di.iiii's CURRENT.md (repo-local — see docs/ai/golden_rules.md for why)
allowed-tools: Read, Edit, Write, Bash
---

Recap this session and update `CURRENT.md`. This repo-local command overrides the
generic `~/.claude/commands/recap.md` — that one's section names and derived-fact
habits don't match this repo's schema and its own enforced rules.

Context:
- `!npm run state` — the live branch/worktree/promotion facts. **Never re-derive these
  by reading `git log` yourself and writing what you find.**
- `!git log --oneline -10`

Steps:
1. Read the current `CURRENT.md` in full.
2. **Replace content — do not append.** The file has no history section; that's what
   `PROGRESS.md` is for.
3. Write these sections, in this order: `active_branch:` / `lanes:` (unchanged unless
   the lanes themselves changed) / `## Last session` / `## What works` / `## Open` /
   `## Deploy & validation`.
4. `active_branch:` is the branch you are **actually on** (`git branch --show-current`),
   not the branch you intend the reader to be on. If you're recapping from a worktree,
   say so under `## Open` — don't let a worktree's session claim the main checkout's state.
5. **Never write a commit SHA, or "N ahead"/"N behind".** Those are derived facts —
   two agents transcribing them from different branches is exactly what produced
   contradictory recaps on 2026-08-06 (see the golden rule). If a SHA matters for
   posterity, it goes in `PROGRESS.md`, not here.
6. One sentence per bullet. Judgment calls, decisions, and what's still open are the
   only things this file is for — everything derivable belongs to `npm run state`.
7. Before finishing: `npm run docs:ai:check` must pass (enforces the 50-line limit,
   the SHA/branch-position ban, and that the recap isn't stale relative to code). Fix
   and recheck, don't eyeball the line count.
