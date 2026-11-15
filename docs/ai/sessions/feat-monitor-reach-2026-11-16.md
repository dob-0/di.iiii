## 2026-11-16 — the monitor reaches the dev tier: reports, tiers, spaces, asks, map, live stream

- Gate by tier (release manifest `deployEnv`, `staging` = dev): dev tier lets an admin session in without loopback, prod is 404 always, local keeps loopback + admin. A visitor on dev gets 403.
- `POST /api/monitor/report`: a machine sends its panels (admin session, or a `di login` terminal login whose ACCOUNT is admin; index.js now carries `cliDbRole` on the terminal-login state, the cap below admin is unchanged for every other route). In memory per host, stale after 120 s, dropped after 1 h, 256 KB cap, 40 hosts.
- `GET /api/monitor` adds `reports`, `tiers` (health probe of dev/prod: commit, behindDev by `git rev-list --count`), `spaces`, `asks`, `map` (serverXR/src/monitorHub.js). `GET /api/monitor/stream` is SSE: `snapshot` on change, at most every 2 s, heartbeat 15 s.
- `POST /api/monitor/ask` (admin session only) stores the ask in table `monitor_asks`. It is NOT handed to agent mail: agentMailStore refuses a message to yourself and addresses people, not the owner's own chats. Open page asks are the inbox for the owner's agents (the `asks` list).
- CLI: `di monitor report [--once] [--every N]`, `di monitor install-timer [--remove]` (user systemd timer, 30 s; scripts/di/monitorReport.mjs). A machine whose `ledger-open` has its own ledger sends its open rows as `asks` (source ledger).
- Not done: the page (Part 2), running the timer on aylmo/studio-mac, a live run against the dev tier (needs this branch deployed there).
