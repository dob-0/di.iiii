## 2026-08-19 — doorways: a hole in a container's wall

- Stage 5, and the thing the owner actually asked for: *"how it in touchdesigner where you
  can put the geometry and inside it objects"*. Place an **In** or **Out** node inside a
  container and a socket with that name appears on the container's outer face. One interior
  node, one exterior port — the mechanism TouchDesigner (In/Out operators), Blender (Group
  Input/Output), Max (inlet/outlet), Unreal (tunnel nodes) and Houdini (subnet inputs) all
  arrived at independently.
- **The property that makes it safe: no edge ever crosses a scope boundary.** The wire
  outside joins two siblings in the parent scope; the wire inside joins two siblings within
  the container. RawEditor's both-endpoints-in-scope filter stays exactly as written, and the
  runtime needs no notion of scope at all. Demonstrated live, not argued:
  `sky.out → desk.door [root/root]` and `door.value → cube.color [desk/desk]`.
- **The socket's identity is the doorway node's own id, never its label.** One choice, three
  defects removed: renaming a door cannot break its wire, two people adding doors at once
  cannot collide on a name, and deleting a door then adding another cannot resurrect the old
  wire onto new plumbing. Order is DOCUMENT order, never `graphX` — dragging a card commits
  an op per animation frame, so position-ordering would re-index a container's face while
  someone drags an unrelated node inside it, detaching every wire outside it in a scope nobody
  is looking at.
- **The delete sweep, in both reducers.** A doorway's wire names the CONTAINER and a port id,
  so deleting the door leaves an edge whose endpoints both still exist. `createEdge` validates
  endpoint nodes only and `normalizeEdgesList` drops edges by missing node id, never by missing
  port — it would be a permanent orphan no reload, normalisation or gesture could clear, parked
  at a card's corner by `inputPortCenter`'s `idx<0` branch. Swept in `src/shared/projectSchema.js`
  AND hand-mirrored into `shared/projectSchema.cjs`: with the client copy alone, the wire
  vanishes locally and the server's replay resurrects it on the next sync. Both copies are
  covered by fixtures, because the parity suite is fixture-driven and an ESM-only edit passes
  green until something exercises the path.
- **Eight call sites.** A container's ports are DERIVED, so `getNodeInputs`/`getNodeOutputs`
  take an optional trailing node list and `cardHeight`/`inputPortCenter`/`outputPortCenter`
  thread it too. Miss one and the container grows a socket the card does not draw, or draws one
  the wires do not land on. `portScopeNodes` is the FULL node list, never `graphCardNodes`: a
  container's doorways live inside it, a different scope from its own card, so the scoped list
  would find none of them and the feature would fail in total silence with every unit test
  still green.
- **Defaults are load-bearing.** Both doorway types carry a real default; without one a freshly
  placed door hands its container a socket that draws, persists, survives a reload and carries
  `undefined`, and the consumer downstream quietly falls back to its own local value — which
  looks *exactly* like a door that works.
- **Known limits, stated rather than discovered:**
  - `node.null` cannot grow doors: its dynamic `portDefs` branch returns before the promotion
    merge. Every node in production today is a `node.null`. Tested as a limit, not a bug.
  - Studio's read-only flat surface shows a promoted port twice — once as a socket on the
    container, once as a separate In/Out card in the same plane — with no line joining them.
  - Document order is server-sequence order after reconciliation, so a door created
    optimistically can change row on sync. Identity is stable; row is not.
  - Deliberately NOT done: dropping edges whose ports cannot be resolved from the wire memo.
    It would also silence every edge into a legacy or removed type, and "my wires disappeared"
    on an old document is a worse failure than the one it fixes. The delete sweep covers the
    doorway case at its source instead.
- **Seen, not assumed**: seeded a desk holding a cube and an In door, dragged a wire from an
  orange colour node into the desk's new **Tint** socket, and watched the cube inside the desk
  turn orange. The Desk card shows its five declared inputs plus Tint, and its three outputs.
  Zero console errors.
- Verified: lint 0 errors · 2282 tests · schema parity green · build clean.
