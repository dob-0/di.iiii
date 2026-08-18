## 2026-08-18 — the example graph was lying in the other direction

- Follow-up to the node families work: I went back for the audit's parked PARTIAL items and
  found the bigger thing first. `allNodesExample.js` — the graph Raw's ⋯ menu opens as the
  portrait of the whole registry — declared `time.beat`, `geom.cube.bounds` and
  `view.image.src` **unwirable**, with a header saying no geometry/texture/signal output
  ever produces a value and "an edge out of one is decoration". Every word of that had
  become false. The 2026-08-06 audit caught NODE_BACKLOG overclaiming; this file was
  underclaiming just as hard, and it is the file a curious person actually opens.
- **Why it rotted:** its staleness test only asserted the named ports still EXISTED, never
  that the claim was still true. So the runtime grew cases (time.beat, geom.cube.bounds)
  and webcam started publishing a live texture, and the list stayed green while
  misinforming every reader.
- **Evaluated every declared output of every placeable type against the runtime: none are
  dead.** One exception found and fixed — `math.mix` returned undefined at rest because its
  `a`/`b` inputs had no defaults, the only placeable output in the registry producing
  nothing unwired; defaults of 0 make it behave like every sibling math node.
- **The guard now derives liveness from the runtime, both directions** — a port that is
  dead but undocumented fails, and a port documented as unwirable that actually returns a
  value fails. Watched it go red on the exact historical drift (re-adding the old
  `time.beat` claim) before going green, per the repo rule about guards never seen red.
- **`view.image` now renders a wired live texture** (audit PARTIAL closed): a DOM element
  can't be mounted twice, so the frame is copied to a canvas per rAF. Verified in a real
  browser — dragged webcam `Frame` → image `Source`, read the canvas back: 640x480, 100%
  non-black, and the panel's timecode advances independently of the webcam panel's. The
  example graph now wires that edge, plus `cube.bounds → desk.scale`, so it demonstrates
  what it used to deny.
- Verified: lint 0 errors · 2177 tests · build clean · looked at.
- Still parked from the audit: `universe.desk.3d` renders a marker box rather than its
  child scope (its card claims more than it draws), and `view.director`'s placement
  affordance dangles without a mounted canvas.
