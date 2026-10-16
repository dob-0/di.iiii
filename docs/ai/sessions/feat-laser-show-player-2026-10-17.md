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
- Open, said: a Studio/viewer control for the show player (today it is the route); the cue clock and the compiled frames'
  phase (the frames were compiled with epoch 0, the document's showEpoch mod period = 22.5 s — the cubes match the ROOM
  exactly, as asked; whether the room matches the cues is a separate row); the full-field zone is the owner's line.
