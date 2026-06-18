---
allowed-tools: Bash(docker ps:*), Bash(docker compose:*), Bash(curl:*), Bash(lsof:*), Bash(git branch:*)
description: Show the status of the full di.iiii dev stack
---

## Task

Check and report the status of each layer:

1. **Branch**: !`git branch --show-current`
2. **Docker**: !`docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "docker not running"`
3. **Backend** (port 4000): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null || echo "unreachable"`
4. **Frontend** (port 5173): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "unreachable"`
5. **Full stack** (port 8080): !`curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null || echo "unreachable"`

Report which services are up, which are down, and suggest how to start anything that's missing.
