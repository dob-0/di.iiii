## 2026-10-17 — the six LaserCubes draw in the 3D room while the lasers play (3D = hall)

- Defect (deep-audit-C-lasers.md finding 1): with a desk live, the MOXIR room drew none of the 36 LaserCube lines
  (rig-laser-1a…6f, `fixture {type:'ext-lc-ultra-mk2', dmx:false}`, no index). The #1011 rule in `dmxPose.js`
  (a lamp with a fixture type and no desk row is dark) caught them, and nothing relit them while the cubes played.
- Rule now: a network laser (`fixture.dmx === false`, with a `beam.laser`) follows the laser server, not the desk:
  drawn as the design holds it while `GET /laser/api/state` says the show plays and the cube that plays its group is
  armed (the player's `show.cubes` map; the engine's `cubes[].armed`), else dark. A DMX laser or lamp with no desk
  row stays dark. `src/rigbuild/laserShowState.js` holds the pure helpers and one poll per page (2 s, a read cut at
  4 s, 60 s on a tier that 404s), running only while the room follows a desk and holds a network laser.
  RIG_BUILD.md §18.4.
- The WIP left at 11:07 was reviewed: kept the store and the hook wiring; removed the project-id gate, the unused
  clock/tween fields and the server playhead route (no caller); fixed a second poll loop, a stale "playing" after
  the last listener left, and a hung read that never counted as failed.
- Tested: vitest rigbuild/dmxPose rigbuild/useRigLook objectComponents/laserLine objectComponents/SpotLight —
  62 passed (6 files); 3 of the new tests fail on the unfixed dmxPose.js. eslint clean on every changed file.
- Not tested: the installed room with di's own player (`POST /laser/api/show`), owed after deploy. The room does
  not follow the rehearsal player (its own process and engine: the installed engine reports `playing: false`).
- Owed: the run's `tween` switch is not carried to the room (it blends only where the document's `frames.tween`
  says so); the room draws its own project's frames for any group the player maps to an armed cube.
