## 2026-08-06 — Raw on touch, the all-nodes example, Studio as a node

- **Graph wiring was impossible on a phone.** A wire starts on the output
  dot's `pointerdown`, which on touch grants that element implicit pointer
  capture — so `pointerup` was retargeted back to the output dot and never
  reached the input dot under the finger. Drops now resolve to the nearest
  *compatible* input port within `PORT_DROP_RADIUS_PX` (36 screen px,
  constant across zoom) via a window-level `pointerup`, one code path for
  mouse and finger. The old drag tests passed green because they stubbed
  `setPointerCapture` over exactly the semantics that were broken.
- Zooming out on a phone (double-tapping the zoom buttons, since there's no
  wheel on touch) bubbled to the graph surface's `onDoubleClick` and opened
  the create-node palette over the graph — `handleSectionDoubleClick` now
  excludes `.raw-graph-zoom-controls`.
- `viewport-fit=cover` was missing from the viewport meta — every
  `env(safe-area-inset-*)` in the app resolved to 0, silently neutering
  Studio's already-written notch handling. Added, plus safe-area padding to
  Raw's fixed chrome.
- `docs/roadmaps/NODE_BACKLOG.md` claims all 27 palette types "work today".
  At port level only 17 do — `computeNodeOutput` has cases for `value.*`,
  `math.*` and `time` only; no `geometry`/`texture`/`signal`/`state` output
  on any node ever carries data. New `src/project/graph/examples/allNodesExample.js`
  covers the whole palette and lists the unwirable ports as such rather than
  wiring them to look complete. Reachable from Raw's ⋯ menu.
- `verify:surfaces` reported ALL CLEAN for `/raw` while actually auditing the
  sign-in card: `/raw` loads an empty workspace, and editor lanes sit behind
  `AuthGate`, so with no session the script audited the gate's panel instead
  of the editor. Now seeds the all-nodes example via `addInitScript`, accepts
  `--token`, and prints `[AUTH-GATED]` when it lands on a sign-in card
  instead of silently reporting clean. Tap findings on `/raw` went 2 → 8 once
  it was actually looking at the editor.
- **`studio` is now a node.** One palette entry; entering it reveals
  Outliner + Scene + Inspector as a subgraph (TouchDesigner COMP / Nuke Group
  pattern). Needed three prerequisite fixes: panel nodes had NO canvas
  representation as graph cards at all (so a wire into a panel was
  invisible); entering a node required hover+double-click below 0.5 zoom
  where a card is a few pixels wide, now a real button; the selection
  inspector used to cover the node it was inspecting, now a bottom sheet on
  phones. `view.outliner`/`view.inspector` — type ids both lanes have
  carried window frames for since they were written — are implemented for
  the first time.

Verified on a real iPhone 15 Pro at 393px with real CDP touch events; full
`verify:surfaces` clean across six profiles including 320px.

## Open, carried from the branch's own notes

- Studio-as-node is a **first slice**: assets/code/share/projects panels are
  still hardcoded chrome (`PublishPanel` alone takes 17 callback props).
  Two decisions deliberately left open, recorded in
  `src/project/graph/studioNode.js`: **port promotion** (which interior
  ports surface on the container) and **live reference vs. frozen snapshot**
  when a subgraph becomes a palette item.
- No user-authored node types yet: `NODE_TYPES` is a static module literal
  with no `registerNodeType`, `node.null` is declared but not placeable,
  `values.__code` is inert, and `templates[]` exists in the schema with zero
  consumers.
