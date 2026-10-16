## 2026-10-17 — the show on the cubes: a project's laser lines played on the real LaserCubes by show time

- Owner 00:1x–00:3x (MOXIR, the night before the show, six LaserCube Ultra Mk2 on the cable, all six tested with di's
  patterns): "we need to go to the full moxir show lets go" → found: the show's laser looks reached the room only; the
  only thing that fed a real cube was a Nodes editor's Laser Out. Owner: "build now".
- `serverXR/src/laser/laserShow.js` (new): the player. Every 50 ms it reads the server clock, picks each laser line's
  frame with the room's own formula (`laserLine.js` §6: list[floor(((t mod period) / period) · n)], t = server seconds),
  joins one cube's lines into one drawing (a blank move to each stroke's first point, a blank at its last; a cube with
  nothing lit draws one blank point), keeps it in the engine when it changes (`setFrame`) and keeps it alive in between
  (`alive`). Lines → cube: a line's id without its trailing letters (`rig-laser-1a`…`1f` = one cube, as `scripts/place/rig.mjs`
  names them). Cube → real cube: `map` { cubeId: groupId }, by default cubes and groups side by side in sorted order
  (cube-1 ↔ rig-laser-1 …). The show holds its cubes as the Out `show:<project>` (one Out per cube): a Nodes editor Out on
  the same cube is refused and the state says `held` per cube. The document is read again every 15 s (an edit during the
  show carries). Nothing of the engine's safety moves: zone, guards and arming are the engine's; an unarmed cube takes
  the frame and emits nothing; the sign-off phrase stays a person's.
- `routes/laserRoutes.js`: `POST /laser/api/show { project, map?, reloadMs? }` (requireSameMachine; 404 no project, 400
  nothing to play, 501 no loader), `POST /laser/api/show/stop` (the stops' gate), `/state` carries `show`; `close()` stops the
  player. `index.js` gives the lane `loadDocument` = resolveProjectContext + readProjectDocument (what the project API reads).
- Tests: `laserShow.test.js` (grouping, the index formula, blank joins, default map, ticks: set on change / alive between,
  stop blanks, held cube retried, explicit map with ignored entries, reload plays an edit) + two route tests. 50/50 in
  the three laser files; eslint clean.
- Rehearsal 00:5x on the real six (branch code, a copy of laser.json, the installed engine disarmed = one sender): dry
  (unarmed) run mapped cube-1…6 ← rig-laser-1…6 (6 lines each), index 66 → 71 over 20 s at period 1116 s / 256 frames
  (4.36 s a frame), buffers 6000 free on all six (no other sender). The armed run's result is in the ledger (N916.x).
- The armed rehearsal (01:0x) found two things, both fixed in the second commit. (1) The engine's still-beam guard stopped
  every cube within 200 ms: the show's comb lines are still beams (the previs strokes wobble under 0.6°), and the guard
  allows only the still beams the officer listed in laser.json. Now `stillBeamsOfGroup` lists every still dot a cube's
  frames hold over one period (as the engine's own `stillBeams` sees them, each once), and `POST /laser/api/show/still
  { project, map?, confirm }` writes them per real cube into laser.json (kept with what was approved before) and reloads the
  engine disarmed — the officer's sign-off is the phrase; without it the route answers 403 with the counts it would approve.
  Measured on moxir-v2-11: 39–54 distinct dots a cube. (2) Every frame point is a direction in ITS LINE's field (the room's
  `fieldDirection`: forward −Y, right +X, up +Z, tan(x · half-angle)), so a cube's six lines all read (0, 0) at their own
  axes — one real cube would have drawn six dots on one spot. `cubeFrameAt` now carries each point to the world through
  its line's rotation (an XYZ Euler, as three.js applies it — `eulerXYZ` is that matrix) and back through the cube's
  (`aimOfGroup`: the mean of the lines' forwards, roll 0, the rig's own [−π/2 − pitch, 0, yaw] convention, undone exactly
  by `aimAt`); a point outside the cube's field is blanked and counted (`outside` in the state), never pulled to the edge.
  Limit, said: the real cube's roll and exact aim on the back wall are not in the document; the operator's geometric
  correction in LaserOS (or a per-cube offset, owed) closes that gap.
- Open, said: a Studio/viewer control for the show player (today it is the route); the cue clock and the compiled frames'
  phase (the frames were compiled with epoch 0, the document's showEpoch mod period = 22.5 s — the cubes match the ROOM
  exactly, as asked; whether the room matches the cues is a separate row); the full-field zone is the owner's line.

## 03:1x — fit fills the keep-in zone, not the field

Measured on the real six (run 3, 57 min, `~/work/agent-reports-2026-10-17/laser-show-run-3-fit.log`): fit about the
field under the default upper-half zone cut 40 % of every picture's lit points (76 of 108 lit frames touched y < 0) and the
clipped stubs at y ≈ 0 read as still beams — 75 guard stops. Change: `zoomOf(scale, strokes, zone)` fits the picture's lit
box into the ZONE (FIT_EDGE 0.9 of each half-extent, centred on the zone's centre; the shorter side decides);
`stillBeamsOfGroup` applies the engine's `applyZone` before counting dots, so the approval lists what the engine will see;
the player and `/show/still` pass `engine.state().zone`. After: 0 % below y = 0 on all six groups, 0 stops in run 5.
Limit: under the upper-half zone a picture fills half the field's height; the whole field is the officer's zone choice
(laser.json `zone`), never the player's. Catalogue entries for the three show routes added (CI's catalogue contract).
