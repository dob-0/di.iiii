## 2026-08-19 — the move op: a node can change scope at all

- Stage 3a. `parentId` was written once at `createNode` and **never mutated by any code path** —
  `applyProjectOps`' `updateNode` builds from an explicit allow-list (label, graphX, graphY,
  runtimeId, assetRef, values) that omits it, so a node's scope was fixed for life. This adds
  the op. **The drag gesture is deliberately NOT in this change** (3b): the schema half lands
  cleanly on its own and the gesture has conditions that are not met yet.
- **ONE atomic op, `reparentNode`, not four loose ones.** As separate ops the reducer refuses
  the `parentId` while still applying `graphX`/`graphY` and any edge deletes — and
  `useProjectDocumentSync` resubmits a 409'd batch **verbatim** after catch-up, so a lost race
  left the wires cut, the node not moved, and the node replanted at a coordinate meaningless in
  its scope, with nothing said. Whole or nothing. Tested in both reducers, including that a
  refused move leaves the coordinates untouched.
- **Two guards, both about silent loss rather than errors:**
  - The destination must exist. A `parentId` naming nothing puts the node in no scope's child
    list, reachable from no Enter and visible on no canvas.
  - A node may not become its own ancestor. `deleteNode`'s `collect()` guards against cycles it
    FINDS; this stops one being made. An unguarded cycle is unreachable, undeletable, and
    recurses on every traversal.
- **The inverse restores the scope AND the position.** Without the coordinates, undo returns the
  node to the right room at the drop point's coordinates — which mean nothing in that room.
- **A bug I shipped in stage 5, found by reading the inverse rather than by a failing test.** A
  doorway's exterior wire names the CONTAINER and the door's id, and the container is not among
  the deleted nodes — so the delete sweep removed the wire while `invertSingleOp`'s
  `restoredEdges` filter (which matches on node ids only) would never have restored it. One
  Ctrl+Z would have silently dropped a wire the user still had. Fixed in both copies, guarded by
  a test that deletes a door, undoes, and asserts the edge comes back.
- Mirrored into `shared/projectSchema.cjs` and covered by `schemaSync` fixtures, because that
  suite is fixture-driven: an ESM-only edit passes green until something exercises the path, and
  a client-only reparent is silently dropped by the server reducer until the next full load.
- **DEPLOY ORDER MATTERS for this one: serverXR FIRST, then the static bundle.** Ship the bundle
  first and every move works locally and is silently discarded by the server until a reload. A
  stale open tab drops the `parentId` key with no version conflict to trigger a resync.
- **What 3b (the gesture) must not do, recorded now so it is not rediscovered:**
  - Restrict the drop target to `universe.desk.3d`. Of the four container types only that one is
    `render: 'spatial-3d'`; `studio` and `universe.space` are `hidden` and `universe.world` is
    `panel-2d`, and `RawViewport`'s childMap is built from `filter(isSpatialNode)` — so dropping
    a Cube into a Studio makes it vanish from the viewport and read as deletion.
  - Derive the parent scope as `authoredNodes.find(n => n.id === currentScopeId)?.parentId`,
    never `navStack[length - 2]`: `goToRoot` sets the stack to `[null, nodeId]` unconditionally
    for the RawHub handoff, so a nested container would report the document root and "move out"
    would yank the node through a scope the user never entered.
  - Do NOT cut edges that become cross-scope. `nodeGraphRuntime` has no `parentId` awareness, so
    they keep evaluating correctly — they are undrawable only because of RawEditor's
    both-endpoints filter. Deleting live user data to work around a client-side render filter
    replicates to every peer and is invisible to the collaborator who did not drag.
  - The undo truth: the drag commits `graphX`/`graphY` every animation frame and those coalesce
    into their own history entry, so ONE Ctrl+Z takes the node out of the box but leaves it at
    the drop point. Do not claim "one batch, one undo step".
  - `selectedNodeId` will still name a node no longer on the canvas after a drop, and a panel-2d
    card dragged into a container silently unmounts its floating window (`windowLayout` scopes
    mounted panels by `parentId`).
- Verified: lint 0 errors · 2293 tests · schema parity green · build clean.
