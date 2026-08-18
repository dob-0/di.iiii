## 2026-08-19 — "I want to build world but can't connect or go inside": the map and the stage were showing two different rooms

- Owner, on Raw vs TouchDesigner: *"i want to build world but cant connect or go inside how it in
  touchdesigner where you can put the geometry and inside it objects"*. Two complaints, both
  reproduced first-hand before touching anything, and the cause of the first was NOT what the
  first look suggested.
- **The mechanism.** The graph canvas filters cards on `currentScopeId` and the palette creates
  with `parentId: currentScopeId`, while every 3D viewport was handed `scopeId={worldNode?.id}`
  — the inside of the live World. At root those are different rooms, so a cube placed at root
  landed somewhere perfectly real and the stage never drew it. One word's disagreement between
  two filters, not a missing feature. Found by a design workflow reading the code, after my own
  first pass wrongly concluded "you must enter the World first".
- **What shipped (stage 1 of six).**
  1. All three viewport mounts now take `scopeId={currentScopeId}` — the room you are standing
     in. `worldNode` is still passed, for sky and lighting. The docked World panel included: a
     World is `render:'panel-2d'` and its live-marker is keyed by its PARENT scope, so it is a
     window onto the room it stands in, not a box things go inside.
  2. `RawViewport` builds a `childMap` by `parentId` and `NodeVisual` recurses, so a container's
     children render INSIDE its own `<group>`. Move, turn or scale a desk and everything standing
     on it travels with it — the geo-COMP behaviour the owner described. Shape copied from
     `StudioViewport.jsx:520-530`, already proven twice in this repo for entities.
  3. Descent stops at a nested `universe.world`: a World is its own stage, and seeing through one
     into another would change what existing spaces show.
  4. `resolveScopeWorldNode` walks up to the nearest ancestor World, so standing in a Desk or a
     Studio no longer gates the 3D off entirely. Cycle-guarded rather than trusting the data.
  5. `StudioWorldSurface` moved to the world's own scope too, or the identical document rendered
     as two different rooms depending on which lane opened it.
- **Four guards, in the same commit, each one a way this silently corrupts work if omitted** —
  every one named by an adversarial pass before it was written, not found afterwards:
  - values resolved for the WHOLE rendered subtree, not just the top row. `NodeVisual` reads
    `node.values` directly, so a nested node wired to a Time node would have frozen the moment it
    went inside something — the "can't connect" complaint, newly caused by fixing the other one.
  - no drag handler below the top level. The drag writes a world-space raycast point into
    `values.position`, which is read as parent-LOCAL; nested drag would teleport a node by its
    parent's transform with no error. `StudioViewport.jsx:542` refuses the same move for the same
    reason. Nested position stays editable in the inspector until there is a gizmo.
  - `nodeScale` (the workspace zoom) folded in at the roots only, passed down as 1, or it
    compounds with depth.
  - a container with no body of its own keeps its `<group>`. The old `if (!body) return null`
    would have swallowed everything standing inside it.
  - the 3D Desk shell stops raycasting, or its skin swallows every pointer aimed at its contents.
- **Seen, not assumed.** Placed a cube at root and watched it appear in the room — it did not
  before. Seeded a desk with a cube standing on it, then moved the desk right and scaled it 1.6×:
  the cube travelled with it and grew in proportion, still on the desk's top face. Opened Studio's
  Open Jam locally afterwards: renders as before, zero console errors.
- **A documented behaviour was deliberately changed**, not worked around:
  `resolveScopeWorldNode` used to return null for a scope with no World of its own, and a test
  asserted it. That null gated the whole 3D surface off. The test now encodes the new intent and
  says why, plus ancestor-preference, no-world-anywhere, and parentId-cycle cases.
- **The other complaint is NOT fixed by this.** Every container type still declares ZERO outputs
  (World 2 in/0 out, Space 1/0, 3D Desk 5/0, Studio 1/0), so a wire cannot start from one, and
  nothing inside a container can be reached from outside. That is stages 4-6: real outputs each
  paired with a runtime case, then TouchDesigner-style In/Out nodes placed inside a container to
  give it ports, then the gesture that promotes an interior port to the surface. Research across
  TouchDesigner, Houdini, Max, Blender, Cables.gl, vvvv and Unreal found one unanimous mechanism
  for this — a container's outer ports exist because sentinel nodes sit inside it — and found that
  the single most repeated user complaint about containers, in every one of those tools, is this
  exact sentence.
- Risk audit, before any of it: production holds 13 nodes across 8 spaces, every one `node.null`,
  zero nested, zero spatial; br_id_ge's four live documents have `nodes: []`; and
  `LiveProjectScene.jsx` never reads `doc.nodes`. This work cannot reach an exhibition visitor.
- Verified: lint 0 errors · 2243 tests · build clean.
