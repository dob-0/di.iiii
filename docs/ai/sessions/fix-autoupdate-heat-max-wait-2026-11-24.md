## Autoupdate: a hot machine updates after 30 minutes of heat skips (2026-11-24)

Owner 11-24: "why it not update the aylmo why it not synced how much time tell that keep workflow synced".
Measured: aylmo journal "skipped-heat cpu package 91 C > 85 C"; studio-mac 91-105 C, never auto-updated.
Fix: HEAT_WAIT_MAX_RUNS = 6 (30 min), then update anyway; count reset on any other run.
Tests: scripts/di/autoupdate.test.js 51 passed.
