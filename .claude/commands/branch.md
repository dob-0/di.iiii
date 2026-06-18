---
allowed-tools: Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git pull:*), Bash(git status:*)
description: Create a new feature branch from dev
---

## Context

- Current branch: !`git branch --show-current`
- Current status: !`git status --short`

## Task

The user will provide a branch name or a description of the feature.

1. If there are uncommitted changes, stop and ask the user what to do first
2. Switch to `dev` and pull latest
3. Create and switch to the new branch named `feature/<slug>` (derive slug from the user's input if not provided)
4. Confirm the new branch is active
