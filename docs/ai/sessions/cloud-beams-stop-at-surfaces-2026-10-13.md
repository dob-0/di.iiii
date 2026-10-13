## 2026-10-13 — physics: every beam stops at the first surface it meets, measured at run time along its current aim

- Owner 20:40 (screenshot from outside the hall): "lights go out of the space - they must stay inside - fix the physics".
  Cause (the lead's): the room drew each beam to a STORED length (`beam.length`, else `light.distance`; epic-build's
  `reachOf` gave `throw_m: null` lamps 120 m) along the lamp's CURRENT aim, which a look changes at run time; nothing
  stopped it at a surface. Also found here: the haze glowed outside the building, and the glare veil of a beam under the
  roof showed through the roof (its hull cap sat ON the roof plane and z-fought it).
- `src/objectComponents/beamReach.js` (new, the shared cast): pure maths (ray vs box, ray vs plane, first of several,
  `coneReach`, `reachFrom`) and the cast against the building's triangles — three-mesh-bvh `raycastFirst` with both faces
  (a model's walls are wound either way), else three's raycast with the material's side opened for the cast and put back.
  The building = meshes under a group tagged `userData.svBuilding` (both renderers tag `isArchitectureEntity`: Studio via
  `pickUserData`, published rooms in `LiveProjectScene`'s entity group) or with SmartView's `svRole`. Re-found ≤ 1/s per
  scene. `createReachTracker`: re-cast only when the lamp's world pose, its directions or the building changed; ≤ 15 Hz
  while it moves (a change inside the window is kept pending and the on-demand loop kept alive); a still lamp is a
  16-number compare.
- `BeamReachProbe.jsx` (new) mounts in `SpotLightObject` (only inside a real Canvas): axis + 8 rim rays at the wider of the
  beam's and the light's half-angle. The cone (flat or in air) is drawn to the farthest point its rays reach along the axis,
  2 cm short of the surface (`SURFACE_GAP`: the cap on the surface z-fought it); the flat cone is also clipped by up to 4 hit
  planes; the light's `distance` is 2 × the farthest hit (the 88 % workaround known-fixes already names; an authored nearer
  cutoff stays). A miss keeps the stored length capped at `MISS_REACH_CAP` 60 m. Each laser line / scanned sub-line ends on
  its own surface (`laserLineGeometry` takes `line.length`); a laser's light casts its axis.
- Haze only inside: `uHazeBoxOn/Min/Max` in the shared haze uniforms = the building's world box; `hazeSigma` is 0 outside,
  and beam-hull and laser fragments outside it are discarded (`hazeOutside`; not in the floor mirror's program, which must
  not discard). JS twin: `hazeScatteringAt` honours `field.box`.
- epic-build: no 120 m. `reachOf(f, dims)` = the first hall surface along the lamp's rest axis (`scripts/rigbuild/hall-reach.mjs`,
  physics_check.py's surfaces line for line), else `throw_m`, else the type's reach, never past 60 m. `--hall <record>|none`,
  default the v13-skin hall record.
- Numbers, measured: epic rig (moxir-epic-2026-10-08), 96 lamps: 92 drawn past their first hall surface at rest before, 0
  after (total drawn 2604 m → 1362 m). Rig v2-8: 14 lamps at 120 m and 21 past their first hit before, 0 after.
  Outside shot over a closed test hall (`scripts/measure/beams-roof-shot.cjs` on `measure/harness/beams-roof.html`, 4 spots +
  1 laser at a stored 120 m aimed at roof and wall, SwiftShader): base 332 beam pixels (9256 with any green trace — the laser
  through the roof and the beams' glow on it), this branch 0 (0); the inside control 10421 → 10392 beam pixels (the beams are
  still there). Shots looked at, both views, both trees.
- Cost per frame (`node scripts/rigbuild/beam-reach-cost.mjs`, 67 500-triangle hall, BVH built once in 54 ms, 9 rays a lamp):
  still lamps 0.04 / 0.23 / 0.35 / 0.64 ms per frame for 10 / 50 / 100 / 200; every lamp re-cast in one frame (a whole-rig
  look change) 2.7 / 3.0 / 6.2 / 9.5 ms, at most 15 such frames a second. Node on this box, not a browser.
- Tests: base 10522 passed / 4 failed (`scripts/di/oneAddressPrinted.test.js`, the same 4 fail on the base: the environment's
  install, not this change) → branch 10538 passed / the same 4 failed. New: `beamReach.test.js` (13: the pure maths, the cast
  through outward-wound faces with and without a BVH, a cone re-lengthening from floor to roof to wall as its aim turns with
  the 15 Hz rule, laser lines, the haze box, the cost). `moxir-v2.test.js`: reachOf never 120, and with the hall every epic
  lamp ends at or before its first hit. `pickPriority.test.js`: the building tag. Server contracts 231/231. Lint 0 errors.
- UNVERIFIED: the real MOXIR rooms (moxir-v2-9 and the dev tier) were not opened — no stack here; a real GPU; the Studio with
  SmartView's cutaway (the beam now stops at the roof even when the cutaway hides it — physically right, not looked at);
  phone. The cast is the lamp's axis and rim, not the cone's whole solid angle; the haze box is axis-aligned (eaves under a
  pitched roof count as inside); the rig's own steel does not stop a beam; without shadows a lamp's light still reaches up to
  2 × its throw beyond a wall. Lamps placed OUTSIDE a building now draw no haze outside it (the owner's rule).
- Next: open moxir-v2-9 from outside (Top, Side) and inside on a real GPU and a phone; then drop physics_check.py's `--fix`
  stopgap lengths (the room recasts) or keep them as the pre-cast draw.
