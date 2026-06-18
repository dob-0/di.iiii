# Parallel Agent Workflow

How to run more than one agent or person on `di.iiii` at the same time without anyone clobbering anyone else's edits.

## The Core Rule

Two agents (or people) must never write to the same working directory at the same time. A single shared working tree means uncommitted edits from one look like stray/conflicting changes to the other (this happened — see golden_rules.md). Pick one of the three isolation modes below based on how close the collaboration needs to be.

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
3. **Commit and push to your own fork** — automatic once validated, no need to wait to be asked

This is safe specifically because your push target is your own fork's branch, which can never affect `dob-0/di.iiii` directly: the `auto-pr.yml` workflow surfaces it as a PR, and a human reviews and merges from the upstream side. This default does **not** extend to pushing directly to `dob-0/di.iiii` (any branch, including `dev`) or to merging a PR — those stay explicit, human-requested actions.

## Mode 1: Git Worktree (preferred for same-repo parallel work)

Each agent gets its own checkout of the repo, sharing the same `.git` history, on its own branch.

```bash
# from the main checkout, create a worktree for agent 2
git worktree add ../di.iiii-agent2 -b agent2/<short-task-name> dev

# agent 2 works entirely inside ../di.iiii-agent2
# agent 1 keeps working in the original directory on its own branch
```

Rules:

- name the branch after the task, not the agent (`agent2/inspector-sliders`, not `agent2-branch`)
- each agent commits and pushes its own branch independently
- merge each branch into `dev` only when its task is done and validated
- remove the worktree when finished: `git worktree remove ../di.iiii-agent2`

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
