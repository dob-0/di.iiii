## Light desk: broadcast keeps off the laser network; the Fader says what leaves (2026-10-30)
- Measured on the show Mac: broadcast frames and polls went onto the cube's link (10.42.1.255); now `broadcastPlan` skips networks holding a cube from laser.json; `broadcastAll: true` restores all.
- Fader: raw holds ride the master by design (engine.js, panic path); kept as default, the page now says "master N% scales them" and keeps the wire number under each fader.
- Tests: artnet.broadcast.test.js (8), tests/test-http.js (+2: raw vs master round trip, broadcastAll).
- Not tested: the live Mac; the lead ships a test copy.
- Left: eslint would not start in this worktree (config error), so only the tests ran.
