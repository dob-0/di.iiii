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

## Measured
- TD through the relay, 5.14 M points: x 0…4095, y 0…4095, 30 100 pts/s, 146-point messages, colour max 4095.
- The hall's envelope per cube (the generator's rules): pitch 2–5° open across yaw ±15°; flanks beyond |yaw| 8–12°
  up to pitch ~14°; the roof lantern over the centre above 4–6°.
- Tests: shapes/registry/runtime 154 green; room/schema/frame 98 green; eslint clean on every changed file.

## Owed
- Raw Laser Out keepalive from a worker and a re-post when the server answers `kept:false` (N943).
- Engine: a clock jump is not a silent cube (N954); the show route needs an `at` clock option.
- The level cap 0.16 and the hall rules (lantern, column line, entry minimum) are the officer's decisions, each a
  switch with a log when taken — not changed here.
- The audit of the whole chain: `~/work/agent-reports-2026-10-17/laser-chain-audit-2026-10-17.md`.
