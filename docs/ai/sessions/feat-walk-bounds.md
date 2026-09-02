## 2026-09-02 — walk mode can be told where the walls are

- New `worldState.walkBounds` `{minX, maxX, minZ, maxZ}` (null by default). The walker's
  clamp used to be a guess — the entities' extent plus `BOUNDS_MARGIN` (22 m), never
  narrower than 18 m each way. A room loaded as ONE model is a single entity at its
  origin, so the guess was a 36 m square around it and the visitor walked straight
  through the walls into the grid. Found on the Cascade club (a 29 × 17 m Blender
  interior on staging); the owner's words: "still look is not locked in club, I can go out".
- Schema: `normalizeWalkBounds` keeps a finite box with min < max on both axes and
  drops anything else (a degenerate box would pin the visitor to a line). Test:
  `src/shared/projectSchema.walkBounds.test.js`.
- Walker: `LiveProjectScene` uses the authored box when present, the extent guess
  otherwise. No UI yet — it is authored data (PUT /document), like `fog`.
- Verified in a real browser on the local stack: stand on the boundary facing the room,
  walk backwards into the wall for five seconds — the frame after is still the room, from
  the wall. Both the entrance wall and the far side wall. Compose the box ~0.5–0.9 m inside
  the real walls: the first try at 0.5 m put the eye inside the wall's thickness.
- Wiki: `scenes-that-show-themselves` gained the `walkBounds` line.
- Not done: an inspector control for it; wall COLLISION proper (this is a box, not the
  room's geometry — an L-shaped room still needs the platform to read the mesh).
