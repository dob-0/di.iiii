# 2026-10-28 — Solid walls: walk mode stops at the scene's own models

Part 2 of the parts plan for walking a dark scene (head light = part 1, PR #1170, separate). Owner ask (ledger N1424/N1439): in walk mode the visitor cannot walk through walls, tree trunks and other solid models; it slides along them.

## Decision

- A project turns it on in its document: `worldState.solidWalls = { enabled: true }`. `null` (the default) is off and walk mode is exactly as before: `walkStep(areas, null, …)` is `confineToAreas(…)`, unit-tested. The server's schema mirror (`shared/projectSchema.cjs`) normalizes it the same way (`serverXR/src/schemaSync.test.js`).
- The walker is a capsule: radius 0.3 m, highest point 0.1 m above the eye, lowest point 0.3 m above the feet. It is swept against the meshes the scene is drawn with, baked into one world-space triangle soup with one BVH (three-mesh-bvh `MeshBVH`, `shapecast`, `ExtendedTriangle.closestPointToSegment`).
- Floors stay as today in this part: the eye stays at `EYE_HEIGHT`. A contact whose normal is more than 70 % vertical never pushes sideways, and anything under 0.3 m never blocks.

## Method (cited)

- Capsule against a triangle BVH, pushed out of every overlap: the pattern of three-mesh-bvh's own `examples/characterMovement.js` (M. Johnson, MIT), package version `^0.9.16`, already a dependency.
- Collide and slide by position correction in steps: the sliding idea is Fauerby, "Improved Collision detection and Response", 2003. Steps are at most half the radius, so the capsule is never more than half a radius inside anything and a thin trunk cannot be skipped. A single call travels at most 48 steps (7.2 m); a longer hitch is cut, not tunnelled.
- Contacts are collected per pass and applied deepest first, each counting what the earlier ones already moved (a projection onto the linearised constraints). Applying them in the order the BVH meets them is wrong: a flat wall is two triangles, and the one touched only along its diagonal pushes sideways. Measured in the first test run: 0.4 m of sideways drift in 2 s of walking straight at a wall; fixed, and the head-on test now asserts less than 1 µm.

## Safety and what it says

- Triangle limit 400 000 (phones 100 000, a guess: phones are NOT measured, owed). Over it nothing is built and the canvas says so: `data-solid-walls="off: 1.2M triangles is over the limit of 400k, walls are not solid in this scene"`, also `console.warn`. A mesh with a non-finite vertex is skipped whole and counted. The build never throws: a failure is `off: could not build the walls (…)`.
- Build time measured on aylmo (Node 22 on this CPU, V8 as in the browser; synthetic boxes, median of 3): 3 k triangles 2.5 ms, 24 k 8 ms, 100 k 34 ms, 396 k 171-243 ms. One `slideCapsule` call: 5-26 µs. In the browser, the forest and its big variant: see the PR.
- The walls follow the scene about twice a second: the set of solid meshes is re-read, and a change that has settled (two looks in a row, at least 2 s after the last build) rebuilds. A mesh that changes on three looks in a row is moving and is left out, and the status says how many (`, 124 left out because they keep moving (a wall needs animation mode static)`).
- The walk viewer gives every unparented object without a parent a slow float and spin unless its `animation.mode` is `static` (`src/project/viewport/entityAnimation.js` `resolveAnimation`). A wall that spins is not a wall, so a project that turns solid walls on sets its walls and trunks to static. Found by the first browser run: the forest's trunks all floated, so only the ground was solid, and the status text said exactly that.

## Not in this part (owed)

- A Studio switch for the field and a wiki line (AGENTS.md: shipped user-facing change); today only the document turns it on.
- Floors: stairs, ramps, falling, floors of different heights.
- Flying, the headset's own locomotion (`XrLocomotion`), skinned and instanced meshes, a wall that moves.
- A phone measurement (build time and frame time at 100 k triangles), and a browser test with a scene over the limit (the limit path is unit-tested).
