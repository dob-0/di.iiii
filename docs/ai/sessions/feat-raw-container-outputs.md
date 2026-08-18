## 2026-08-19 — a wire can start from a container

- Stage 4 of the container work, and the first half of the owner's second
  complaint: *"cant connect"*. It was literally true. **Every container type
  declared zero outputs** — World 2 in/0 out, Space 1/0, 3D Desk 5/0, Studio 1/1
  — so `nearestOutputPort` had an empty list to iterate, the press fell through to
  the card-drag branch, and pressing-and-pulling on a World **silently moved the
  card**. Not a UX gap: a data-layer one.
- **The rule this change commits to, in one line: A CONTAINER OUTPUTS ITS OWN
  SETTINGS, NEVER ITS CONTENTS.** Reaching inside is port promotion — sentinel
  nodes placed in the container, one per exterior port — and is deliberately a
  separate stage. Research across TouchDesigner, Houdini, Max/MSP, LabVIEW and
  ComfyUI found that assuming wires pass through a container automatically is the
  single most repeated user complaint about containers *in every one of them*, so
  the boundary is drawn hard and said out loud in the code.
- **Shipped**: `universe.world` → Title (string), Sky (color). `universe.desk.3d`
  → Position, Rotation, Scale (vec3), so something OUTSIDE the desk can follow the
  desk; things inside already move with it through the scene graph. `studio` →
  Title.
- **Rejected, with the reason recorded in place rather than deferred vaguely**:
  - `universe.space` keeps zero outputs. Its one setting is showChrome, and no
    input anywhere in the registry could consume a chrome boolean to a visible
    result — the exact dead-wire disease.
  - World bounds/size: not honestly computable. `geom.cube.bounds` comes from its
    own `size` input; a World has no size and nothing in `src/` measures a
    subtree's extent.
  - World `live`: computable, but the codebase holds two conflicting definitions
    of live (RawEditor's strict marked-check vs `resolveScopeWorldNode`'s
    first-created fallback), and shipping a port would bless one and make the
    other read as a bug. No consumer either — boolean→string is incompatible.
  - Desk gridVisible/bgColor echoes: no observable consumer.
- **Every output ships with its `computeNodeOutput` case in the same commit.**
  Without one, the fallthrough returns the node's own stored value and silently
  ignores any wire into the matching input — a port that draws, persists, survives
  a reload and lies, which is strictly worse than the undefined it replaces. 34 of
  the registry's 70 existing outputs are already in that state; this adds none.
- **A footgun made real, then made true.** `arePortsCompatible` has always allowed
  `color → vec3` and the input dot lights up as compatible, but `asVec3` returned
  its fallback for any non-array — so the wire drew and quietly produced
  `[0,0,0]`. Nothing reached it because no container had a colour OUTPUT. The
  World's Sky makes it reachable, so `asVec3` now reads hex, normalised 0..1
  (0..255 would put a red sky 255 units off-stage).
- **A tested behaviour deliberately reversed**: `studioNode.test.js` asserted
  `outputs` must be `[]`, on the grounds that the runtime could not compute one.
  True then — and the answer was to add the case, not to leave the card unwireable
  forever. The test now asserts the rule that actually matters, against the real
  runtime: every declared output must produce something, AND must carry the
  **wired** value rather than the stored one. The second half is load-bearing; a
  "did something come out" check passes against the very fallthrough it should
  catch.
- **Card geometry did not move.** Outputs are at or under the input count on every
  container (2/2, 5/3, 1/0, 1/1), so `Math.max(inputs, outputs, 1)` is unchanged
  and no port centre shifted. A third output on `universe.world` would grow every
  World card by a row and visibly detach every wire on every saved document — it
  would read as a rendering glitch, not a bug. Guarded by a test.
- **Seen, not assumed**: in a real browser, dragged from a World's Title output —
  a dot that did not exist before — onto a text panel's Content, and watched the
  panel read *"The rehearsal room"*. Edge persisted as `world.title → note.content`,
  zero console errors.
- Honest scope note for the PR: that demo works with the panel standing **beside**
  the World. Cross-scope edges are still unauthorable, so "the panel in the room
  names the room" is not yet what ships.
- Verified: lint 0 errors · 2267 tests · build clean.
