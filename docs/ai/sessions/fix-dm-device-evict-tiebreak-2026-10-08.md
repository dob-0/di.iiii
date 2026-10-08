## 2026-10-08 — the device cap drops the earliest device, even within one millisecond

- serverXR/src/dmDeviceStore.js ordered the cap's DELETE and listDevices by `last_seen_at` only. Devices published in the same millisecond tie and SQLite returned them in public-key order (random), so the cap dropped a random device. Found as a CI failure of batch #830 (test passed 15/15 on aylmo, failed on the faster CI runner).
- Fix: tie-break on `rowid` (arrival order) in both queries.
- Guard: new test in serverXR/src/dmDeviceStore.test.js freezes `Date.now` and publishes keys in descending key order; failed 5/5 before the fix, whole file 10/10 after. Row added to docs/ai/known-fixes.md.
