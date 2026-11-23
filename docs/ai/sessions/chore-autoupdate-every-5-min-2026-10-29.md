## Auto-update checks every 5 minutes (N1463 lever D)
- `EVERY_MINUTES` 15 → 5: after a dev deploy an install waits 0–5 min (median 2.5), was 0–15 (median 7.5). `RandomizedDelaySec=60` was already in the unit.
- A tick = hub `/serverXR/api/health` + release `checksums.txt`, both small anonymous GETs; di names itself, so the hub allows 300 reads/min/address (appVisitors.js). 12 ticks/h is far inside it.
- Installs on the old timer: `di autoupdate run` now calls `refreshTimer` at its end and rewrites + restarts the timer when its text differs. No reinstall.
- Tests: `scripts/di/autoupdate.test.js` (unit text, refreshTimer). Not tested: a real tick on an install.
