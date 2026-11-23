## 2026-10-30 — Laser engine sends every point on time (catch-up pacing, underrun counter)

- laserEngine.js now works out the points due from the time since the last stream (fraction carried, stall capped at 100 ms, cube free count still caps the send) instead of a fixed 600 per tick; guards unchanged.
- The fake cube got a ring buffer that counts underruns and overflow (scripts/laser/fake-cube-buffer.mjs); fake-cube-rehearsal.mjs sets its own loopback flag and exits non-zero below 28000 points/s.
- Fake cube, 2 runs: old engine 28923-29343 points/s and 49-58 underruns; new 29700 points/s and 2-5 underruns.
- No cushion is built yet and an Ultra's empty-buffer behaviour is unknown: both need a real cube. Merges only after a real-cube test.
