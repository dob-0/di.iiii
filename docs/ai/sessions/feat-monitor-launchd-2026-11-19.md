## 2026-11-19 — `di monitor install-timer` on macOS (launch agent)

- Why: the report timer was systemd only; the Mac (studio-server) could never report, so the map showed it as a bare tailnet dot.
- What: `installLaunchAgent` writes `~/Library/LaunchAgents/xyz.diiii.monitor-report.plist` (every 30 s + at login) and loads it with launchctl; `--remove` undoes it. `runMonitor` picks it on darwin.
- Tested: `npx vitest run scripts/di/monitorReport.test.js` on work-laptop, 17 passed (4 new); eslint on both files clean.
- Not tested: a real launchctl run on the Mac (test-pi cannot run macOS; needs mac-safe-change).
- Found while checking: dev answers 404 to `monitor report` until the owner's account id is in `DEV_MONITOR_OWNER_USER_IDS` on the Mac's dev env; test-pi's public di 0.4.3 has no `monitor` command.
