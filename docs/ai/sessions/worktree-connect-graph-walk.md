## 2026-08-24 — a room made of nodes can be walked into, and worn

The gap CURRENT.md listed as "the honest gap" is closed. It was never a decision
that needed making — it was a missing renderer, and the gate that hid the button
had been correct every single day, which is why it read as settled.

**What was actually wrong.** Two renderers with no shared arithmetic. `RawViewport`
drew node bodies but owned its own Canvas and OrbitControls, so a node room could
only ever be looked at from outside. Walk mode (`LiveProjectScene`) owned the
walker, the bounds and the whole of XR — and drew `entities` only. The invariant
"walk must never show LESS than orbit already shows" was being kept by refusing:
graph-only rooms got no Walk / Fly button, and since Enter VR / Enter AR live
inside walk mode, no headset door either.

**What changed.** The invariant is now kept by rendering.

- `useGraphSceneModel.js` — the graph evaluation lifted out of `SceneContent`
  unchanged (asset map, clock, frame memory, context, scoped nodes, child map,
  lighting, grid, sky, the authored camera). Both renderers call it, so the room
  a visitor looks at and the room they step into cannot drift apart by hand.
- `GraphSceneBodies.jsx` — those bodies mounted inside somebody else's Canvas.
  Read-only by absence, the way `/out` is: no selection, no drag, so the only
  `<Html>` in `NodeVisual` can never render and this path carries no `raw.css`
  debt. The world is COMPOSED, not replaced — the node lane's sky, light and grid
  appear only where the node lane authors them, so a mixed room whose world was
  set in Studio keeps exactly the world it had.
- `LiveProjectScene` mounts it from its OWN `doc`. `sceneExtras` was the tempting
  seam and the wrong one: a caller's copy is free to go stale against the live
  stream this component already keeps open. Gated on `showEntities` alongside the
  entities — StudioHub passes it false for a bare decorative grid, and a node room
  drawn there would put a stranger's furniture behind the hub.
- The viewer's gate loses its node condition along with the reason for it.

**Three defects found by LOOKING, not by testing.**

1. Stepping in made the room visibly BRIGHTER than the orbit view a click
   earlier — lights ADD, and the host's ambient + sun were being summed with the
   node lane's. `graphAuthorsLighting()` now makes the host's pair stand down.
   Nothing would have caught this: the room looked perfectly plausible alone.
2. `bounds`/`center` were measured from entities only, so a walker in a node room
   was fenced into a 20m box with the work standing outside it. Both now derive
   from `roomPoints`, the union of both lanes. Root scope only — a node inside a
   container is placed relative to that container.
3. Caught before it shipped: gating the bodies on anything other than
   `showEntities` would have drawn a published room behind StudioHub's UI.

**Seen, not inferred.** A stranger's session (no cookies) on a local mirror of the
`open` space, project `worldrendertest` — 5 nodes, 0 entities, the exact case that
could never be walked.

- desktop 1280×800 DPR 2: walker moved 4.00 units (z 6 → 2), the cube grew from
  64,433 to 681,467 blue pixels as it neared. It is a body at the author's
  position, not a backdrop.
- phone 390×844 DPR 3: the room renders and the joystick moves the walker
  (z 6 → −7.34), driven with real CDP touch events. A synthetic mouse drag moved
  nothing and proved nothing — emulation lies about touch, again.
- entity-only regression (`wcc/alla-virabyan`, 12 entities, 0 nodes), same build
  before and after: orbit **pixel-identical**; walk differs by 0.061%, and the
  same build shot twice differs by 0.060% — that is the room's own idle animation,
  not this change.

**Still owed / deliberately not done.**

- The grid still belongs to whoever draws it: a node room with no `world.grid`
  node walks on `LiveProjectScene`'s infinite grid, not on the orbit view's fixed
  24×24. Both are "a grid"; unifying them means deciding whose default wins.
- Fog stays the host's and is keyed to the host's background, so an authored sky
  far from `worldState.backgroundColor` would haze the wrong colour.
- No portable loop guard: the visual check needs a seeded local project, so it is
  a scratchpad probe, not a `verify:surfaces` page. That belongs with lane 6 of
  the workshop map.
- Not deployed. `dev` merges deploy to staging, and staging is the Dilijan camp's
  production this week — the merge is the owner's call, not mine.
