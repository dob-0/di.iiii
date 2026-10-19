---
description: Pre-show or pre-demo readiness check — git state, local stacks, own di, dev tier
allowed-tools: Bash(git branch:*), Bash(git status:*), Bash(git log:*), Bash(di-dev ls:*), Bash(curl:*)
---

## Context

- Branch: !`git branch --show-current`
- Working tree: !`git status --short | head -15`
- Last commits: !`git log --oneline -5`
- Local stacks (aylmo, di-dev): !`di-dev ls 2>&1 | head -20`
- Own installed di: !`curl -s -o /dev/null -m 5 -w "%{http_code}" http://diiii.localhost/`
- Dev tier: !`curl -s -o /dev/null -m 8 -w "%{http_code}" https://dev.diiii.xyz/`

## Task

Report **Go / No-go** in at most 10 lines: is the tree clean and on a task branch, which local stacks run and at which `*.diiii.localhost` address, do the own di and the dev tier answer 200. If something is missing, name the one command that fixes it (`di-dev up <tree>`, `di-dev doctor`). Never start a server yourself with `npm run dev`, `npx vite` or a bare port.
