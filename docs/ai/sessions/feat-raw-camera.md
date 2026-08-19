# feat/raw-camera — the authored eye

Phase 1 of the show spine (owner: "go", 2026-08-20, after the TD operator
audit): a Camera node, so where the audience looks is authored, not wherever
orbit was left.

## What changed

- `world.camera` in the registry: Position / Look At / FOV inputs (all
  wireable — a Time→Sin→Position wire is a camera move), spatial-3d, family
  "the room". Defaults are byte-identical to the room's built-in view.
- Activation is EXPLICIT-ONLY via the card's ● toggle
  (`pickAuthoredCameraNode` in RawViewport) — deliberately unlike
  Light/Background/Grid's first-created fallback: the palette drops nodes at
  the click point, and auto-activation cut the room to an accidental
  floor-level close-up the moment the card landed (seen in browser before the
  fix). Placing a Camera never steals the view.
- Marked: the room is seen through it (useFrame drives position/fov/lookAt
  every frame), OrbitControls unmounts (the two would fight over the eye),
  and its body disappears. Unmarked: a small housing marker with a lens cone
  aimed at Look At; unmarking releases the view in place, orbit remounts.
- A camera counts as no room content in `scopeHasRoomContent` — the eye is
  not something to look at; a camera alone must not summon an empty room.
- allNodesExample: camera standing inside the example Geo. Wiki bullet +
  USER_MANUAL section. Registry tests (spatial, defaults byte-identical),
  viewport tests (never steals / owns view when marked / scope-local).

## Verify

Place cube + camera → view unchanged, housing visible. Click ● → the room is
the camera's shot, housing gone; type Position in the inspector → view moves
live. Unmark → orbit again. Screenshots read at DPR 2.
