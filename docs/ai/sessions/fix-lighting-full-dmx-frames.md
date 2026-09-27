## 2026-09-24 — lighting desk sends full 512-slot DMX frames

- Ported from the standalone studio desk (viz.di.formal, branch `studio`): `serverXR/src/lighting/desk.js`
  no longer trims frames to the highest patched channel. A 25-channel studio rig got 26-slot frames on an
  ENTTEC DMX USB PRO and its RGB lights ignored them entirely while the desk showed correct values.
- Every universe now leaves as `FULL_FRAME` (512) — ENTTEC, Art-Net, extra widget sends and the empty-desk
  refresh. sACN already sent whole universes. Measured on the ENTTEC: 34 frames/s, 4.5 ms average write.
- Guard: `tests/test-wiring.js` "every DMX frame leaves full length" (seen red with one `|| 24` put back).
  The desk's three suites (`test.js`, `test-wiring.js`, `test-http.js`) pass with `ARTNET_OFFLINE=1`.
- Not done here: the studio desk's other work (stage objects, Stage page, video pixel-mapping, even Follow
  slots) is not ported yet — that is the larger "converge the two desks" job.
