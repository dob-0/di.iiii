## 2026-10-21 — `di update` waits out a 429 from the hub and names who answered when it gives up

- `scripts/di/channels.mjs` `hubCommit`: the health read (`/serverXR/api/health`) retries on 429 and 503 only — Retry-After (seconds or HTTP date) else 2 s, 4 s, 8 s; ≤ 3 retries; ≤ 30 s total wait; per-request timeout unchanged. The failure line now carries status, `server`, `cf-ray`, `retry-after`, retry count and the first 120 body characters.
- Why: one install, 10-19..10-21, 5 of 12 dev-channel update runs failed with 429 (four in a row 23:30-00:16 +04) while curl/fetch by hand got 200; no serverXR limiter covers `/api/health`, so the edge is the likely source — the new line is what will prove or refute that.
- Tests: `scripts/di/channels.test.js` 16/16 pass; the 6 new cases fail on the old code (shown once). `scripts/di` as a whole: 519 pass, 4 fail in `openFile.test.js` / `oneAddressPrinted.test.js` identically with and without the change (missing `dotenv` in serverXR, `diiii.localhost` not resolving in the cloud container).
- Not tested: a real 429 from the edge; a real install's 15-minute timer. Worst case added to one update run is 30 s of waiting plus 3 extra requests.
