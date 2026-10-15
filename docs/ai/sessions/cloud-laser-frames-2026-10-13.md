## 2026-10-13 — laser frames in time (N562): the 40 W's matrix and the cubes' fan sweep

Cloud agent, branch `cloud/laser-frames-2026-10-13` off `fix/moxir-selection-box-and-scenes-2026-10-13`.

- `beam.laser.frames` = `{ period (s), list: [frame…] }` next to the static `frame` (`src/objectComponents/laserLine.js` §6:
  `framesOf`, `frameIndexAt`, `laserFrameAt`, `scanLinesAt`, `nextFrameIn`). The frame on at show time t is
  `list[floor((t mod period) / period · n)]`; t is the SERVER's wall clock (`serverClock.js` offset), not counted from
  `showEpoch` (the lamp has no document). Without `frames` the static path is the same `scanLines(laser.frame, …)` call.
- `SpotLightObject.jsx` `LaserLines`: `useLaserFrameIndex` — one timer to the next frame change, invalidates the on-demand
  loop; nothing runs for a laser without frames.
- Schema (`src/shared/projectSchema.js` + the hand mirror `shared/projectSchema.cjs`) keeps `frames` with the same caps
  (256 frames, 20 000 points, period 0.05–3600 s); `projectSchema.light.test.js` checks both.
- `scripts/rigbuild/laser-frames.mjs` (new) + `epic-build.mjs --laser-frames`: each UP-LA40WF beam a MATRIX static `frame`
  (`--matrix-n`, default 9, grid at ±60 % of the field → lines within ±7.4°), each LaserCube line a FAN SWEEP `frames`
  (±6° over 24 s, 48 frames; capped by the field beside the cube's widest line). With no `--api` it prints the frames from
  the rig file; with a scratch `--api` it is a dry run unless `--apply`. Measured: the dry run on
  `moxir-v2-8-matrix-2026-10-13.json` prints 38 beams of 8 units (6 cubes × 6 lines swept ±6°, reach ±8.55°; 2 × 40 W matrix of 9).
- `fixtures.json`: `scan_field_half_deg` 18.5 on `lasercube` and `laser`, both basis ASSUMED.
- ASSUMED: the cube's ±18.5° field; the 40 W taking the cube's; a cube's axis = the mean of its lines; the sweep is along
  the beam entity's local X. UNVALIDATED: where swept lines end on the walls (drawn to their static length); never applied
  to any stack; not looked at in a browser. Limit: a framed laser takes its colour from the frame's points (the unit's
  colour), so a look's `laser_colour` does not recolour it — the static `frame` path already behaves so.
