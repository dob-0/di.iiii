---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git branch:*), Bash(git log:*)
description: Stage all changes, commit with a good message, and push to origin
---

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Diff: !`git diff HEAD`
- Recent commits: !`git log --oneline -5`

## Task

1. Stage all relevant changes (`git add`)
2. Write a concise commit message (what changed and why, not what files)
3. Commit and push to origin
4. Report the commit hash and push result

Do not create a PR. Do not amend. One new commit.
