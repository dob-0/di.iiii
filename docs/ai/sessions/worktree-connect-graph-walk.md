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

## 2026-08-24 (second) — Studio and Raw are arrangements of one project, not two tools

Owner: *"i think it better to see every space project as raw, so its dual studio
and raw is connected"*, then *"we need to UI and UX fix"*, then *"we can have too
many versions and idea is to have multi layer and method control"*, then *"it can
be changeable in real time so every version is good we can give real flexibility
to create"*.

**The concept, settled before any code.** Studio and Raw were never two products.
They are two arrangements of the same layers over the same document, and which one
you want changes minute to minute while you are making something. The door you
enter should not decide, permanently, which half of your project you can see.
Nothing about the data model changed — no migration, no schema, no op-log work.
Objects stay objects, nodes stay nodes, one document as before.

**What the code already had, and what it was missing.** The document has carried
both lanes all along; `/{space}/{project}/studio` and `/…/raw` already open the
same project and write the same ops. The wall was narrower than "connect the
lanes": four separate surfaces each asked "are there nodes" when they meant "is
there anything here". Each was individually true. The sum told a person their work
was not in the project.

**Arrangements (`workspaceMethods.js`).** A method is a named set of layers, and
applying one is ordinary ops — live, synced, one undo step. Two rules make it safe
to flip all day: it HIDES and never deletes (every window keeps its size, place
and contents), and it may summon a VIEW but never content (it will not invent you
a Scene). The second is DECLARED on the layer, not derived, because it cannot be
derived — `universe.world` is a `panel-2d` type exactly like `view.inspector`, its
window just happens to be a room. Which arrangement you are in is READ OFF the
windows, never stored, so moving one by hand honestly reads as "no longer in an
arrangement" rather than a label still claiming something you changed.
Four to start: Arrange · Wire · Publish · Clear.

**Objects became citizens (`objectCards.js`).** Cards on the canvas — plainer than
a node's, own hue, no ports, because an object has no wires and a card that looked
wirable would be a worse lie than the blank canvas it replaced. The layout is
DERIVED from index, never written to the document: opening a window on someone's
work should not edit it. Selecting one reaches the same selection Studio's outliner
and the room already use, so the Inspector needed no teaching. Also: the Outliner
lists both lanes, the toolbar counts both, and zen's `nodeCount` became `workCount`.

**Four defects found by LOOKING, none of which a test would have caught.**

1. A desktop arrangement written into the shared document arrived on a phone as
   four full-bleed sheets stacked on each other. Slot-by-slot resolution can scale
   a plan but cannot change its shape — `resolveMethodFrames` now resolves a method
   as a SET, and narrow gets bars-plus-one-open.
2. The first phone stack put its bars ON the window below them: it reserved the
   44px touch floor, and a minimized window renders at `height: auto` — measured
   64px. A rule about tap targets read as a fact about rendered height.
3. Counting both lanes overflowed the 390px toolbar by 3px, pushing ⋯ — the only
   route to Save, Spaces, Wiki, Home — off the edge. The phone now shows one
   number and the aria-label carries the breakdown. `check:toolbar-overlap` caught
   it; it must be run against a project WITH content or it asserts nothing.
4. My own new memos rebuilt every render because `document.entities || []` minted a
   fresh array each time. Caught by lint, not by me.

**Seen, both sizes, on real projects.** `wcc/alla-virabyan` (12 objects, 0 nodes)
— the case that was invisible — and `open/worldrendertest` (5 nodes, 0 objects).
Desktop 1440×900 DPR 2: Arrange produces Outliner · room · Inspector · Create,
which is Studio, inside Raw, live, from one palette command. Phone 390×844 DPR 3:
two title bars over an open Outliner listing both lanes, notice legible above the
thumb controls, no horizontal overflow, `check:toolbar-overlap` green at
1440/900/700/390.

**Still owed.**

- An arrangement cannot be SAVED yet. Four built-ins, no "save this as a method",
  which is the half of "method control" that lets someone hand a way of working to
  the Dilijan kids. It needs a decision on where a custom method lives (with the
  project, or with the person) — the first is shareable, the second is private,
  and they are different features.
- The room is still a `universe.world` node's window, so an object-built project
  can only reach its room full screen. The notice says so rather than pretending.
  A room window that does not need a node needs a home for its frame.
- Objects still cannot be DRAGGED on the canvas (their layout is derived) and
  cannot be entered. Both are deliberate for now; both are askable-for.
- Studio's own side is untouched: its panels are still localStorage-only, so an
  arrangement made there still cannot travel. That is the same fix from the other
  end and it is the obvious next piece.
- Not deployed. `dev` deploys to staging and staging is the Dilijan camp's
  production this week — the merge is the owner's call.
