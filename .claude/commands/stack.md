---
description: Local stack status — every di-dev tree, port, owner and health (aylmo)
allowed-tools: Bash(di-dev ls:*), Bash(di-dev doctor:*), Bash(curl:*), Bash(git branch:*)
---

## Context

- Branch: !`git branch --show-current`
- Trees: !`di-dev ls 2>&1 | head -25`
- Doctor: !`di-dev doctor 2>&1 | head -25`
- Own installed di: !`curl -s -o /dev/null -m 5 -w "%{http_code}" http://diiii.localhost/`

## Task

Summarize in at most 8 lines: which trees are up, their `http://<tree>.diiii.localhost/` addresses, any UNMANAGED server the doctor reports, and whether the own di answers. For anything missing name the one command (`di-dev up <tree>`, `di-dev down <tree>`); never start or kill a server by hand.
