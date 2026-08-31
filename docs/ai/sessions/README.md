# Session notes — branch-local, transient, append-only

**Why this directory exists:** `CURRENT.md` describes the state of `dev`, and its own
convention is "replace, don't append" — so every branch that pre-writes what it thinks
`dev` will look like is racing every other branch doing the same thing. On 2026-08-06
that raced badly enough to be measured: `CURRENT.md` was rewritten 22 times in one day
from 3 different branches, and separately, three different sessions' real notes were
silently destroyed by a concurrent rewrite before their branch ever merged — recovered
afterward from `git fsck --dangling`, which nobody would think to run. See
`docs/ai/golden_rules.md` and `PROGRESS.md`'s 2026-08-06 entries for the specifics.

The fix: `CURRENT.md` is now written by exactly one thing — `npm run land`, when a
branch actually merges into `dev`. Everything a session wants remembered in the
meantime goes in a file here instead, one per branch, at a path only that branch
writes to. Two branches can never collide on this, because they never share a path.

## Format

One file per branch: `docs/ai/sessions/<branch-slug>.md` (slugify the branch name —
`/` becomes `-`; `chore/sync-safety-rescue` → `chore-sync-safety-rescue.md`).

`npm run land` quotes the note's FIRST `## ` heading verbatim as `CURRENT.md`'s
"Last session" line — give it a real title, never a template placeholder ("What
this branch does" landed as dev's whole current-state summary on 2026-08-21).

```markdown
## 2026-08-06 — a one-line title for what this branch did

- What happened, in the same voice as PROGRESS.md — concrete, no filler.
- No commit SHAs or ahead/behind counts (derived facts, see the golden rule below —
  `npm run state` reports those live; a note that repeats them just goes stale).
- If something is still genuinely undone, say so plainly — this is exactly the kind
  of note that used to get lost.
```

Append to your own file across a session; don't touch anyone else's.

## Lifecycle

1. Working on a branch → write/append to `docs/ai/sessions/<your-branch>.md`.
2. Open a PR into `dev` → CI (`docs:ai:check`) requires exactly one such file, matching
   your branch, with at least one `## ` heading. Exempt: branches matching
   `NOISE_BRANCH_PATTERNS` in `scripts/repo-state-lib.mjs` (dependabot, etc).
3. Land the PR → whoever runs `npm run land` on `dev` folds every file in this
   directory into `PROGRESS.md` (newest at top) and rewrites `CURRENT.md`'s "Last
   session" from them, then deletes the note files and runs the worktree sweep.
4. `docs/ai/sessions/` must be **empty** on `dev`/`main` — enforced by `docs:ai:check`,
   which is what makes step 3 non-optional instead of a courtesy nobody gets to.

See `docs/ai/golden_rules.md` for the rule this backs, and
`~/.claude/plans/humming-wiggling-wozniak.md` (not tracked in-repo) for the fuller
sync-safety plan this is one piece of.
