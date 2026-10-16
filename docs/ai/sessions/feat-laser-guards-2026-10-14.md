## 2026-10-14 — Laser guards: host-side path optimiser, temperature limiter, park-at-centre stops, byte-5 fix

Branch `feat/laser-guards-2026-10-14` from `origin/dev` 4a10bc1c. Owner's "yes go", ledger N641.4. Evidence read first:
`~/work/agent-reports-2026-10-14/laser-guards-{touchdesigner,wicked-nannou,ofx-openlase-helios}.md` — every host that drives
LaserCubes or galvos (OpenLase, Wicked's libLaserdockCore, ofxLaser, nannou lasy, TouchDesigner Laser CHOP) smooths the
path on the HOST; the cube documents only a 76 °C cut-off. di sent shapes raw.

### What was built (serverXR, so EVERY frame source is protected)
- `serverXR/src/laser/laserGuards.js` (new, pure; method + sources in its header):
  - step limit per point, Chebyshev (per galvo): lit 2/80, blank 2/20 field units at 30 kpps, scaled with the cube's rate
    (libLaserdockCore `ldRendererOpenlase.cpp:282-297`; OpenLase `svg2ild.py:24-26`, `libol.c:468,727`; ofxLaser `Laser.cpp:1818`);
    the loop back from the last point to the first is split too; a new frame is reached by a blank bridge.
  - corner hold: ≥ 30° turns get ceil(turn / 0.6 rad) points at 30 kpps (90° → 3, 180° → 6) (OpenLase `get_dwell` 30°,
    ofxLaser 30° split, lasy 0.6 rad/pt, libLaserdockCore quality corner_dwell 3).
  - start/end dwell 2/2 (libLaserdockCore quality); blanking delays from the owner's TD Laser CHOP: 1 ms blank before colour on,
    0 after on, 0.3 ms lit before off, 0.005 ms blank after off (→ points at the rate, rounded).
  - temperature limiter = Wicked `ldLaserPowerLimiter` (`ldHardwareFilter.cpp:67-142`): 150 samples at 100 ms, 100 % at 60 °C
    → 50 % at 75 °C, 50 % above; ≥ 75 °C the cube is `hot` in state.
  - stop = blank where the beam is, blank walk to the centre, 10 points parked there (Helios firmware `main.c:260-272`).
- `laserEngine.js`: frames are optimised per cube at its rate (cached until the frame or rate changes); the still-beam guard
  judges the OPTIMISED frame; every stop (no frame, still beam, link lost, disarm, shutdown) sends the park BEFORE `0x80 0` ×2
  (a never-armed cube gets no data point, only the off commands, as rule 1 says); colours scaled by the limiter;
  `/laser/api/state` shows `guard.path` (defaults), per cube `guards`, `path` (points in/out, frames/s, max steps, plan in points)
  and `temperature` (last, average, samples, powerScale, hot, the cube's own warning/over-temperature flags).
- Config: defaults in code; `laser.json` `"guards": {…}` for all cubes, per-cube `"guards": {…}` over that; a bad value falls back.
- Optional `SET_RATE 0x82` (`[0x82, int32 LE]`, as the TD script sends it): only with `guards.sendSetRate: true`, default off.
- `lasercubeProtocol.js`: byte 5 is FLAGS (see known-fixes 2026-10-14); temperature signed.
- `scripts/laser/fake-cube-rehearsal.mjs`: a fake cube on 127.0.0.2 + the real engine, real sockets — the 10-09 rehearsal's
  scratch scripts now live in the repo.

### The byte-5 investigation (diagnose wide)
Hypotheses: (a) disarm never sends `0x80 0`; (b) it sends but the cube ignores it; (c) di's parse is wrong; (d) wrong offset.
- (a) ruled out: the engine sends `[0x80,0]` twice on disarm (unit test with a fake socket; fake UDP cube heard it, 10/10).
- (c) PROVEN: Wicked's own driver reads byte 5 as flags, bit 0 = output (`LaserDockNetworkDevice.cpp:348-365`); nannou
  `status.rs` agrees. 2 = bit 1 only = output OFF. di read any non-zero as on.
- (d) ruled out by the real answer `77 00 00 01 11 02 …` (fw 1.17 at bytes 3-4, flags at 5). The TD script's
  `'<xxBB?5x…'` reads bytes 2-4 — one byte early; its "output" bool is really the firmware minor.
- (b) not testable without the real cube; the data point (armed-then-disarmed cube 2, never-armed cube 0) fits "output off".
  OPEN: why bit 1 ("interlock enabled" in the maker's naming) is set only after an arm.

### Measured (2026-10-14, aylmo, fake cube 127.0.0.2, `node scripts/laser/fake-cube-rehearsal.mjs --runs 10`)
- stream: 29 387–29 610 points/s reach the cube (lit 27 919–28 147/s), the eight shapes switching every 40 ms; buffer overflow 0
- longest step the cube was sent: lit 0.0254, blank 0.1001 field units (limits 0.025 / 0.1; the excess is the 12-bit rounding,
  one device step = 0.0005)
- signal loss: output-off 160.5–163.7 ms after the last frame post's wait (≤ 40 ms after the post → ≈ 200 ms timeout), park
  arrived before off 10/10, 0 lit points after off
- still beam (60-point dot): off 199.6–202.9 ms after the dot was posted, park first 10/10, 0 lit after
- disarm: off 0.1–0.3 ms, park first 10/10; shutdown: off 0.5 ms, park first
- after disarm the engine reads the fake cube's byte 5 = 2 as outputEnabled=false, interlock=true
- temperature 70 °C: state average 70.0, powerScale 0.667; the colour the cube received in the 15–16 s window 0.684 of full
  (the 150 samples take ~16 s on 20 ms ticks, so the window was not quite full)
- the eight Laser shapes, optimised, worst share of one 0.6° window at 30 kpps: 6.4 % (size 0.5), 19.8 % (0.1), 38.8 % (0.05)
  — still under the 50 % still-beam line; none stops; every collapsed shape does (raw was 5.9 / 21.0 / 39.7 %).

### UNVALIDATED (owed on a real cube, with the owner and the LSO)
Every number above: step limits, corner hold, dwell, blanking delays, park points, temperature curve on THIS cube; that the
cube cuts the beam on `0x80 0` before playing its buffer out; SET_RATE on fw 1.17; bit 1's meaning. Checklist: the 10-09 note
(`git show 7e212847:docs/ai/sessions/feat-laser-drive-finish-2026-10-09.md`) plus: look at a square at full size on the wall
(corners sharp, no overshoot), a full-field blank jump (no ghost line), and read the frames/s in `/laser/api/state`.

### Round 2 — the review of PR #931 (`~/work/agent-reports-2026-10-14/laser-guards-review.md`)
Each finding was first reproduced on ae1ba1ac with the reviewer's scripts: a 2000-point zig-zag became a 5.7 s pass and lit
points streamed 5 720 ms after an all-blank frame; ticks took 90–279 ms with 6 cubes; a spot plus one far point passed.
- §1 **Frame budget**: one optimised pass ≤ 67 ms of points at the cube's rate (2000 at 30 kpps — the longest pass before
  the guards), never above its ring buffer − 200. Over it the frame is REFUSED (`frame-too-long` stop, `path.overBudget` in
  state), never sped up. A **dark** frame cuts the lit pass at once. Decision: a new LIT frame still starts at the end of the
  playing pass (≤ 67 ms, as before the guards) so an animated figure is drawn whole — named here; cutting every frame
  at once would tear every figure the editor animates at 25 fps.
- §2 The path work runs once per posted frame in `setFrame`, cached on the frame per (guards, rate, budget) and shared by
  cubes with the same; the tick only looks it up. Reviewer's script: tick 0–1 ms (was 90–279), setFrame 2–4 ms for 6 cubes.
  Test: 6 cubes × 2000 points, tick < 20 ms.
- §3 Still if the posted OR the optimised frame is still (spot ×40 + far blank, spot ×30 + far stroke, spot ×120 + far blank: all stop).
- §4 Every stop: CLEAR_RINGBUFFER 0x8d ×2, park, output-off ×2; resume and arm: 0x8d ×2 before 0x80 1 (Wicked's driver
  `LaserDockNetworkDevice.cpp:22, 1007-1012`). Order chosen clear → park → off (the coordinator wrote park → clear → off; a
  clear after the park would drop the park). Fake cube: the park is kept after the clear 10/10 but arrives AFTER the off
  0/10 — the two ports have no order; the dark comes from the off. UNVALIDATED on a real cube.
- §5 laser.json values are clamped into safe ranges (only stricter than the loosest cited practice; `guards.clamped` in
  state); the path is planned at the rate the cube says it plays (`rateMismatch` in state when laser.json asks another;
  SET_RATE is sent only with `sendSetRate` and a `dacRate`).
- §7 Temperature average restarts at every arm; a stale reading (> 2 s) is not sampled; the cube's over-temperature flag
  stops it (arm again), its warning drops the power to `tempMinScale`.
Fake cube rehearsal round 2 (10 runs): 28 979–29 430 points/s; max step lit 0.0254 / blank 0.1001; dark at 160–162 ms
(signal loss), 200–204 ms (still beam), 0.2–0.3 ms (disarm), 0.6 ms (shutdown); 0 lit points after off; clears dropped up to
485 queued points at once; 70 °C → colour 0.667 of full (window filled).
