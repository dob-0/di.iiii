# feat/laser-shapes-td-2026-10-17 — TD's scenes as shapes, lasers v4, the room blends like the cubes

Session "laser", the night of 2026-10-16/17 before the MOXIR show. Branch off dev after #1010 landed.

## What is on the branch
1. **Laser node shapes** (`src/project/nodes/laser.shape/laserShapes.js`): `galaxy`, `sunflower`, `noisy`, `grid` — the
   owner's four TouchDesigner scenes (NairoDorian `TD_LASER_CUBE_WIFI_LAN_2022.toe`, read with toeexpand), plus inputs
   `copies`, `rainbow` (TD's COLORS ramp), `cycle` (a comma list of shapes plays in turn, TD's switch1). 6 tests.
2. **Lasers v4** (`scripts/place/rigs/moxir-scenes-50-2026-10-17.json`): the 22 lit scenes redesigned for the whole field
   inside the hall's envelope; compiled with 0 physics fails; written into moxir-v2-11 (v600).
3. **The room blends like the player** (`src/objectComponents/laserLine.js` `poseAt`, `SpotLightObject.jsx`
   `useLaserFramePose`): keyframes that `tween` glide between frames at 20 Hz, the same arithmetic as
   `serverXR/src/laser/laserShow.js`; the reach probe casts once a step. 4 tests.
4. **Schema keeps `frames.tween`** (both twins) so the room and the player agree by the document itself. 2 tests.
5. Devices doc: TD's stream measured through a relay (same 12-bit field; the zone was the only wire difference).
6. **The twelve shapes pass the still-beam guard and the frame budget** (the first CI run of #1019 was red on five
   laser tests): the galaxy's points sit at equal distances along its log spiral (equal angle steps had heaped half
   of them at the centre — a dwell at 0.536); the sunflower is one lit line through at most 300 phyllotaxis seeds
   along 21 Fibonacci arms, out on one arm and back on its neighbour, with a round petal at every turn-around — not
   TD's dots (a dot is a still beam) and not separate arms (a lifted pen costs ~45 points, a sharp reversal ~20).
   `laser.test.js` / `laserGuards.test.js` now pin twelve shapes and the re-measured headroom (worst share at size
   0.1 after the guards 19.8 % → 21.7 %, the galaxy). Devices doc rows: how much line one frame holds; the cubes'
   cable connection.

## Measured
- TD through the relay, 5.14 M points: x 0…4095, y 0…4095, 30 100 pts/s, 146-point messages, colour max 4095.
- The hall's envelope per cube (the generator's rules): pitch 2–5° open across yaw ±15°; flanks beyond |yaw| 8–12°
  up to pitch ~14°; the roof lantern over the centre above 4–6°.
- Tests: shapes/registry/runtime 154 green; room/schema/frame 98 green; eslint clean on every changed file.
- 11:0x: one frame holds ~50 field widths of lit line at 35 kpps (2333 points × 0.0214); a 170° reversal costs ~20
  hold points, a blank stroke ~45; a line through N seeds is ≈ 2·√N radii. The sunflower at size 1: 2244 points
  (16 fps); every laser test file green (22 files, 286 tests).
- 10:05:47: the cubes' cable connection disconnected from the desktop's network menu; all six `link-lost` at
  10:06:13; back at 10:09:50; dark until re-armed by hand at 10:19 (devices doc, "The cubes' cable connection").

## Owed
- Raw Laser Out keepalive from a worker and a re-post when the server answers `kept:false` (N943).
- Engine: a clock jump is not a silent cube (N954); the show route needs an `at` clock option.
- The re-arm after a lost link stays a human step: a cube that re-armed itself once the link returned was built and
  withdrawn the same hour (a safety stop is not loosened on a show night; if the officer wants it, it is its own
  reviewed change). What stays: nobody touches the cubes' "Wired connection" during the show.
- The level cap 0.16 and the hall rules (lantern, column line, entry minimum) are the officer's decisions, each a
  switch with a log when taken — not changed here.
- The audit of the whole chain: `~/work/agent-reports-2026-10-17/laser-chain-audit-2026-10-17.md`.
