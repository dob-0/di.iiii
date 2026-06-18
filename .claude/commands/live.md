---
allowed-tools: Bash(git branch:*), Bash(git status:*), Bash(git log:*), Bash(docker ps:*), Bash(curl:*), Bash(lsof:*)
description: Pre-show or pre-demo readiness check for live performance or exhibition
---

## Context

- Branch: !`git branch --show-current`
- Uncommitted changes: !`git status --short`
- Last commit: !`git log --oneline -1`
- Docker: !`docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "docker not running"`
- Backend (4000): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null || echo "unreachable"`
- Frontend (5173): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "unreachable"`
- Full stack (8080): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null || echo "unreachable"`

## Task

Report readiness for a live show or exhibition demo:

1. **Git state** — warn if on wrong branch or if there are uncommitted changes that could affect behavior
2. **Services** — which are up, which are down
3. **Go / No-go** — one clear verdict with any blockers listed
4. If anything is down, suggest the exact command to start it

Keep it short. This is a pre-show check, not a debug session.
