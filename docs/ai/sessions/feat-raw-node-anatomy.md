## 2026-08-19 — what a node is made of

Standing inside any node, "what is it made of" opens a reading of that node. It asks
the same four questions of all 64 node types — what it takes and gives, what works
that out, what puts it on screen, what is inside it — and the ONLY structural
difference between a Cube and a container is that the fourth answer is occupied. That
sameness is the point: a container stops being a special kind of thing and becomes a
node whose fourth answer has something in it, which is also the seat depth 3 fills.

This is the second of the three things the owner asked for with "we all have as a
constructor". The first (entering a code-made node says so instead of showing a blank
canvas) shipped in `feat-raw-scene-placement`. The third — a cube that IS a graph —
is still ahead, and slot four is where it lands.

- Two ways in, both only while you are standing inside something: a control on the
  "inside X" marker, and a button on the canvas when that scope is empty. Studio wraps
  `RawGraphSurface` read-only and passes no handler, so no button appears there.
- Every fact comes from the running program. `readNode` (`src/project/graph/nodeReading.js`)
  asks the registry which ports exist, asks the runtime what is on them, and derives
  the rest by substitution. There is no hand-written sentence describing what a node
  DOES anywhere in it — such a sentence is wrong after the next edit and no test can
  catch it. Node labels and port labels are rendered verbatim from the registry, which
  is also why the parallel vocabulary pass cannot break this surface.
- `resolveInputRow` replicates `evaluateNodeInput`'s decision EXACTLY rather than
  asking "is there an edge". Those are different facts: the runtime follows the wire,
  and falls back to the node's own value if the far end resolves to undefined. A row
  that printed "wired from X" while showing the node's own number is the confident
  wrong answer this whole surface exists to remove.
- `isLiveFedOutput` asks the runtime by substitution — evaluate twice, once with an
  empty liveOutputs map and once with a `Symbol` under the port's key — instead of
  keeping a list. A live case written tomorrow classifies itself on the day it lands,
  and it catches the two that a "the value is null" test misses (`device.midi.in`
  coalesces with `?? 0`, `agent.keeper` with `?? ''`).

### Found by looking, not by reading

Five defects, none of which any unit test could have reported:

- Opened inside a Scene, the sheet rendered BEHIND the room's canvas
  (`.raw-world-fullscreen` is z-index 1200, a window frame's default is 20) while its
  button stayed perfectly clickable — a control that looked like it did nothing. Found
  by hit-testing the middle of the sheet with `elementFromPoint`.
- It opened underneath the selection inspector on a desktop and 3px inside the
  selection sheet on a phone. Entering a node selects it, so the inspector is up
  every single time this opens: the collision was the default case.
- It opened level with the "inside X" marker, which is z-index 1400 and printed
  straight over the window's own title.
- Its `aria-label` replaced the visible words rather than containing them, so the
  button answered to a name nobody could see (WCAG 2.5.3).
- The marker control was 120×21 — well under this lane's own 44px floor.

All three window-placement facts are now arithmetic in `windowLayout.js` with the
measurements that produced them, and `getScopeMarkerTop` is shared by the marker's own
style and the frame that must clear it, so the two cannot drift.

### Two things this surface revealed that are NOT fixed here

- **A doorway's declared fallback never reaches the runtime.** `doorwaySocket` sets
  `default: fallback ?? null` specifically so an unwired door does not carry undefined
  — but `getNodeInputDefault` calls `getNodeInputs(node)` with no scope list, so it
  cannot see doorway sockets at all and returns undefined anyway. The comment at
  `nodeRegistry.js` claims the defect is prevented; at runtime it is not. The sheet
  reports what the runtime actually hands out ("nothing wired in", value `nothing`),
  because a nicer sheet describing a room that does not exist is the worse outcome.
  Fixing the runtime is a real behavioural change and wants its own review.
- **The way out of a scope is labelled `‹` with "Leave" only as a title**, so its
  accessible name is the glyph. Left alone deliberately: it is an existing control and
  the parallel vocabulary pass owns its wording.

### Verified

Seen in a browser at 1440×900 (DPR 2) and 390×664 (DPR 3), against a local server, as
an ordinary visitor: inside a Cube, inside a container with a wired In door and an
unwired Out door, and inside a fullscreen Scene. No console errors, every control
reachable at its centre by `elementFromPoint`, nothing under 44px, and the sheet clear
of both the marker and the selection inspector on both surfaces.

Two guards were watched failing before their fix: the provenance rule (an
edge-presence implementation mislabels a wire that carries nothing), and the wiring
(handing the sheet the scoped card list instead of the document renders a raw uuid
where a door's name belongs).
