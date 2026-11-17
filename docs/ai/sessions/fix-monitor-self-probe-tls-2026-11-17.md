## 2026-11-17 — Monitor: Connected things read this server over https when it speaks https

- Cause: probes used `http://127.0.0.1:443/serverXR/...`; the installed server is TLS-only there, so every row said "off · fetch failed". Measured: http rc 52, https 200 on all six routes.
- Fix: `monitorRoutes.js` `localScheme` (index.js passes https when `servedCertificate` is set); `monitorStore.js` `loopbackHttpsFetch` reads only `127.0.0.1` without certificate verification.
- Guard: `monitorStore.test.js` real https server test; fails with the fix bypassed (1 failed), passes with it (16 passed). Lint: 0 errors (1 old warning, not ours).
- Owed: install of this commit on the installed di (a window; it reloads his pages), then a look on his screen. Not seen live yet.
