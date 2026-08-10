# Session — docs/estate-audit

## 2026-08-10 — estate-keeping rules from the worktree audit

- Full audit of the worktree estate (14 trees, 3 stashes) after a session was
  blocked by `git switch dev` refusing — `di.iiii-algomerge` held `dev`, stale
  behind origin. Written down as **The Holding Rule** in `parallel-agents.md`:
  no side worktree checks out `dev`/`main`.
- Named the sweep gap: `npm run land`'s auto-reap stopped firing when merges
  moved to `gh pr merge`; seven finished worktrees had piled up. Merging via gh
  still means you land. Three checks before removing any tree: clean tree,
  occupancy ack, contained-or-pushed (squash-merges make ancestry lie — a
  pruned remote ref is the better merged-signal).
- Shared-stash discipline written down (refs/stash is common to all worktrees;
  tagged pushes, apply by SHA, triage at land time).
- Verification charter gains: verify with the session the user actually has —
  an admin API token reported a space working while the owner's guest browser
  session got "Access restricted".
- Recovered the Express 5 bare-`*` boot-death lesson from an uncommitted
  `known-fixes.md` edit sitting in the og-preview worktree — landed here before
  that tree is reaped.
- Still undone, deliberately: the actual reaping (waits on the owner's word),
  freeing `dev` from algomerge, stash triage verdicts, and the companion
  `npm run state` holders/drift upgrade (separate branch, in flight).
