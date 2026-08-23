## 2026-08-24 — a room with a graph beside it can be walked into again, and worn

- A published page hid Walk / Fly whenever the document had any `nodes`. That guard was
  written for graph-ONLY rooms, where it is right: walk mode enters `LiveProjectScene`,
  which renders `entities` and not `nodes`, so the visitor would be moved from the work
  they are looking at into an empty version of it and read the emptiness as the room.
- The owner has since settled the mixed model — one document carries both lanes, wires
  and scene and light in the node editor, anything that must survive for a visitor made
  as an entity. Under that model a graph beside a real entity room proved nothing, and
  the button was being refused to rooms that had a body to walk into.
- The cost was larger than the button: Enter VR / Enter AR live inside
  `LiveProjectScene`, and walk mode is the only door to it. No walk meant no headset
  entry at all on every mixed room.
- The gate is now `(!hasGraph || hasWalkableEntities)` — hidden only when the graph is
  all there is. `?preview=1` and `?embed=1` still suppress it, untouched.
- The same gate had a second half, found while designing a room against it: it also
  required `entryView === 'scene'`, so choosing `fixed-camera` made an author give up
  a walkable room to get a composed opening shot. Those are unrelated things — the
  authored camera only replaces the auto-framed opening shot, and `LiveProjectScene`
  never read `entryView` at all. It is now `isSpatialEntry` (`scene` or
  `fixed-camera`); `code` still hides the button, being a page in an iframe with no
  room to offer.
- `hasWalkableEntities` skips entities marked `components.runtime.visible === false`,
  the same flag `LiveProjectScene` uses to drop an entity with its whole subtree; an
  all-hidden entity array would otherwise rebuild the empty room the original guard
  exists to prevent. It does NOT try to judge which entity types draw pixels — a
  lights-only or group-only room, and a visible entity whose only parent is hidden,
  can still pass. Classifying types in the viewer would duplicate renderer knowledge
  and would hide walk from every entity type added after it.
- Guards in `PublicProjectViewer.test.jsx`: a mixed room shows the button and really
  reaches `LiveProjectScene`; a graph-only room still hides it (that test now states
  the protection in full, so it is not deleted as redundant); hidden entities do not
  count. Both new guards were watched failing against the pre-fix gate.
- No document data touched, no `xrDefaultMode` flip. Viewer gating only.
- Looked at but deliberately NOT done: letting a document open already standing in the
  room. `navMode` is `useState('orbit')` and no data path reaches it, so a visitor
  always lands in orbit and must press a button. It is not the one-liner it looks
  like: the effect at `PublicProjectViewer.jsx:196` resets `navMode` to `'orbit'`
  whenever `presentationState.entryView` changes, and that fires a second time when
  the document ARRIVES (`undefined` → a real string), so any initial `'walk'` seeded
  in `useState` is silently stomped between the first paint and the loaded document.
  A real opt-in means giving that effect a way to tell "the author changed the entry
  view mid-session" from "the document just loaded" — a ref holding the last seen
  entryView — and only then reading the opt-in (a `walk` entryView, or `?walk=1`).
  Two or three lines plus a test, but it changes when the reset fires, which is
  load-order behaviour on every published page. Not the week for it.
- LOOKED at, not only tested: an isolated serverXR (spare port, its own DATA_ROOT,
  this branch's `dist` as CLIENT_DIR) served three hand-authored rooms to a headless
  Chromium at DPR 2, signed in as nobody. Seen: a mixed room offers Walk / Fly and
  walking it lands in the real entity room — plinth and sphere in their authored
  colours, WASD chrome, FLY, "← View mode" — not an empty grid; a graph-only room
  renders its node cube with NO button anywhere; a fixed-camera room opens on the
  composed off-axis shot AND offers the button; `?preview=1` and `?embed=1` on the
  mixed room show no button at all. Zero console errors on every one.
- NOT verified on a live tier by anyone: this branch is not deployed. The check owed
  on staging is the same mixed room with a real anonymous session, and a headset
  finding Enter VR once inside walk mode — no XR device was involved here.
