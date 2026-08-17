# Parallel Agent Workflow

How to run more than one agent or person on `di.iiii` at the same time without anyone clobbering anyone else's edits.

## The Core Rule

Two agents (or people) must never write to the same working directory at the same time. A single shared working tree means uncommitted edits from one look like stray/conflicting changes to the other (this happened — see golden_rules.md). Pick one of the three isolation modes below based on how close the collaboration needs to be.

## The Parking Rule

The main checkout is the user's **viewing surface**, not a workbench. Before a session
ends, leave it detached at (or on) `origin/dev`:

```bash
git fetch && git checkout --detach origin/dev
```

All branch work lives in worktrees under `.claude/worktrees/` — never park the main
checkout on a task branch. A session that left it on a merged feature branch had
`npm run dev:browser` silently serving code 115 commits behind `origin/dev` for two
days (caught 2026-08-10). `npm run dev` and `npm run state` now print a stale-tree
warning, but the warning is the backstop — parking is the rule.

## The Holding Rule

**No side worktree ever checks out `dev` or `main`.** The flow branches belong to
nobody: the main checkout parks *detached* at `origin/dev` (above), side trees hold
task branches only. A side tree that holds `dev` blocks `git switch dev` everywhere
else ("'dev' is already used by worktree at …") and — worse — lets the branch pointer
go stale while the name stays authoritative: on 2026-08-10 `di.iiii-algomerge` held
`dev` 10 commits behind `origin/dev`, so "we're on dev" meant two different trees
depending on who said it. If you find a side tree holding a flow branch, free it
(`git -C <tree> switch --detach`) or remove the tree if it's finished; `npm run state`
names the holder of each branch and its drift from origin.

## Choosing A Mode

| Mode | Use when | Sync mechanism |
|---|---|---|
| [Fork](#mode-0-fork-simplest-for-newcomers) | A new or occasional contributor, low setup overhead, no need for fast back-and-forth | GitHub Pull Request |
| [Worktree](#mode-1-git-worktree-preferred-for-same-repo-parallel-work) | Trusted regular contributor/agent working tight loops alongside others in the same session | Push branch + local merge into `dev` |
| [Role-scoped same branch](#mode-2-role-scoped-same-branch-work-lighter-weight-higher-risk) | Two agents, no time to set up isolation, scopes provably don't overlap | None needed — no shared files touched |

Start simple. Fork is the default for "someone new wants to help." Reach for worktree once a contributor is doing rapid iterative work that benefits from staying in sync with `dev` without round-tripping through GitHub each time.

## Mode 0: Fork (simplest for newcomers)

For an artist/contributor who just wants their own sandbox and doesn't need tight sync:

1. They fork `dob-0/di.iiii` on GitHub to their own account
2. They clone their fork and work on it freely — nothing they do can affect the real repo
3. **Before starting any new task**, pull latest upstream first: `git fetch upstream && git merge --ff-only upstream/dev` (requires `git remote add upstream https://github.com/dob-0/di.iiii.git` once, per `ONBOARDING.md`). Skipping this is the most common cause of stale-branch conflicts on the eventual PR.
4. When ready to share, they push to their fork and open a Pull Request against `dob-0/di.iiii`'s `dev` branch
5. We review the PR (or `gh pr checkout <number>` to test locally first), then merge it into `dev` from our side

This is the lowest-overhead option: no worktree setup, no branch-naming convention to teach, no risk of touching files outside their own copy. The cost is that sync only happens at PR boundaries — fine for someone contributing occasionally, too slow for back-and-forth pairing within one session.

### Optional: auto-open the PR

Opening the PR is still a manual step by default. A contributor who wants their fork to auto-open (or update) a PR every time they push can copy [../templates/fork-auto-pr.yml](../templates/fork-auto-pr.yml) into their own fork at `.github/workflows/auto-pr.yml`. It needs a personal access token saved as a fork-side secret (`UPSTREAM_PR_TOKEN`) since the default `GITHUB_TOKEN` can't open PRs on a different repo — see the comments in the template for exact setup steps. This only automates *opening* the PR; review and merge into `dev` on the upstream side stays manual.

### Default behavior for an agent working in a fork

The full unattended loop, every task, no need to ask permission for any of these three steps:

1. **Sync first** — `git fetch upstream && git merge --ff-only upstream/dev` before starting work, so the task is never built on a stale base
2. **Work, then validate** — lint/build/test must pass before moving on
3. **Commit and push to a task branch on your own fork** — `feat/…`, `fix/…`, or `chore/…`, automatic once validated, no need to wait to be asked

This is safe specifically because your push target is your own fork's branch, which can never affect `dob-0/di.iiii` directly: the `auto-pr.yml` workflow surfaces it as a PR, and a human reviews and merges from the upstream side. This default does **not** extend to pushing directly to `dob-0/di.iiii` (any branch, including `dev`) or to merging a PR — those stay explicit, human-requested actions.

> **The one rule that makes auto-sync actually fire:** the work must be on a **task branch**, not the fork's `main` or `dev`. `auto-pr.yml` ignores `main` and `dev` (`branches-ignore`), so committing a fix to your fork's `main` leaves upstream completely unaware of it — no PR, no notification. If you already committed to `main`, branch from it (`git switch -c fix/<name>`) and push that branch so the PR opens. Pushing more commits to the same branch updates the open PR automatically.

### Upstream (dob-side) agents: receiving fork work

If you are working **in `dob-0/di.iiii` itself** (not a fork), this is how fork contributions arrive and stay in sync:

1. Fork task-branch pushes auto-open PRs against `dev` (title = branch name, body links the commits). List them: `gh pr list --repo dob-0/di.iiii --base dev`.
2. Review/test a PR locally with `gh pr checkout <number>`; run lint/build/test before merging.
3. Merge accepted PRs into `dev`. Promote `dev -> main` only when explicitly asked (that path triggers a production deploy — see the Release Rule in `AGENTS.md`).
4. Merging into `dev` is what keeps every fork current: each fork's next `git fetch upstream && git merge --ff-only upstream/dev` (step 1 of the fork loop above) picks the work up. Nothing else is needed to "push" updates back out to forks.

## Mode 1: Git Worktree (preferred for same-repo parallel work)

Each agent gets its own checkout of the repo, sharing the same `.git` history, on its own branch.

**The actual convention is `.claude/worktrees/<task-name>/`, created by the Claude Code
harness's `EnterWorktree` tool** — not a `../di.iiii-*` sibling. (An earlier version of this
doc said "either is fine"; by 2026-08-06 that had produced a mix of both plus four `/tmp`
scratchpad worktrees, none of them consistently tracked. Sibling checkouts still exist for
long-lived roles — `di.iiii-algomerge`, `di.iiii-studionode` — but a new *task* worktree
belongs under `.claude/worktrees/`.)

```bash
# equivalent to what EnterWorktree does, if you need the raw command:
git worktree add .claude/worktrees/<task-name> -b <task-name> dev
```

Rules:

- name the branch after the task, not the agent (`inspector-sliders`, not `agent2-branch`)
- **push with `-u` on your first push, no exceptions**: `git push -u origin <branch>`.
  A branch with no upstream configured exists only on this one disk — two real branches
  were found in exactly this state on 2026-08-06 (one had never been pushed at all; the
  other was silently tracking `origin/dev`, so a bare `git push` from it would have landed
  straight on `dev`). `npm run state --brief`/the SessionStart hook flags any `UNPUSHED`
  worktree for exactly this reason.
- write your session's notes to `docs/ai/sessions/<branch-slug>.md` as you go (see its
  README) — **not** to `CURRENT.md`, which a feature branch may not touch at all
  (`docs:ai:check` refuses it). This is what stops your notes from being lost if a
  concurrent branch on `dev` moves first.
- **run `npm run state` before any fan-out** — it reports how many worktrees and unmerged
  branches already exist, and (`headSubject`) what each unmerged one is actually about, so
  a new task doesn't start on top of work someone's already doing (two agents independently
  fixed the same bug this way on 2026-08-05, unaware of each other)
- merge each branch into `dev` only when its task is done and validated
- **removal is not a courtesy — it happens automatically.** Whoever runs `npm run land` on
  `dev` after merging sweeps every worktree that's confirmed merged, clean, and not live.
  You don't need to remember to run `git worktree remove` yourself unless your worktree
  needs to go before the next landing (e.g. you're reusing the task name).
- **…but the sweep only fires if someone lands.** Since merges moved to GitHub PRs
  (`gh pr merge`), sessions stopped running `npm run land`, and by 2026-08-10 seven
  finished worktrees had piled up as sediment — several on branches whose remote refs
  were already pruned. If you merge via `gh`, the sweep is still your job: run
  `npm run land` (or at least `npm run state` and act on its `finished?` hints) before
  the session ends. Before removing ANY tree, three checks, no exceptions: its
  `status --porcelain` is empty (a "finished" tree was found carrying an uncommitted
  known-fixes entry that had never landed anywhere), no session is sitting in it
  (name the directory and get an ack — a tree was once removed under a session
  mid-write), and its unique commits are contained in `origin/dev` or pushed
  (squash-merges make ancestry lie; a pruned remote ref is the better merged-signal).
- **the stash stack is shared** — `refs/stash` lives in the common gitdir, so every
  worktree and every session sees the same list. Never bare `git stash`/`stash pop`:
  push with a message (`git stash push -u -m "<tag>"`), restore by SHA with `apply`,
  and triage the stack at land time — three untagged stashes from long-merged
  branches sat unclaimable for days because nothing tied them to an owner.

## Mode 2: Role-Scoped Same-Branch Work (lighter weight, higher risk)

If a temporary worktree isn't worth the setup, agents can share one working tree only if they have **non-overlapping file scope** for the whole task. Use the role table in [roles/README.md](roles/README.md) to assign each agent a distinct "Owns" lane (e.g. one agent on Inspector/CSS, the other on serverXR routes) and confirm neither agent's file list overlaps before starting.

If you discover mid-task that another agent's uncommitted changes are sitting in files you need to touch:

1. do not edit or discard those files
2. `git stash push -- <file>` to set them aside (never `git checkout --` or `git reset --hard` on someone else's in-progress work)
3. do your unrelated work, commit/push it
4. `git stash pop` to restore the other agent's changes exactly as they were

## Merge Order

- each agent merges its own branch into `dev` when done; don't merge a branch you didn't author without checking with the other agent first
- resolve overlaps by re-reading both diffs, not by preferring whichever lands first
- after merging into `dev`, only merge `dev` into `main` when explicitly asked — that triggers a production deploy
