## 2026-08-19 — expose a port on the container

- Stage 6, the last of the container work. Doorways (stage 5) work but had to be placed and
  wired by hand. Now: stand inside a container, hold a port dot for half a second — or
  right-click it — and choose **Expose on the container**. The doorway node and its wire are
  created in ONE op batch, so a single undo takes both and there is no intermediate state
  where a door sits wired to nothing.
- **Reported honestly: this does not solve discovery.** A long press advertises itself to
  nobody. It is a shortcut for the gesture someone already knows, not the way anyone finds out
  doorways exist — placing an In/Out node from the palette by hand remains that. The port dot's
  tooltip carries the hint, which is the most a dot can do.
- **The socket it makes is one scope up and off-screen**, so the gesture would otherwise look
  like it did nothing. A notice says *"Desk now has a Color socket"* with a **Go and see**
  button that navigates to the container's own scope and selects it.
- **Corrections applied, each one a real failure mode:**
  - The long press registers `pointerup`/`pointercancel`/`pointermove` on the WINDOW, not the
    dot. `handleOutputPointerDown` releases pointer capture for every non-mouse pointer, so on
    touch the pointerup goes to whatever is under the finger — element-level handlers would
    leave the timer armed and pop the menu half a second later over whatever was tapped next.
  - Opening the menu clears `pendingWireRef`, `pendingWire` and `draggingNodeId`. A press on an
    output dot has already armed a wire; left armed, the next release anywhere on the canvas
    snaps within 36 screen pixels and creates a plausible-looking edge nobody asked for. Tested.
  - **Go and see** navigates by the container's own parent id, never `navStack.length - 2`. At
    the root that index is -1, which truncates the stack to empty and takes the trail, the
    Escape exit and the scope marker with it.
  - `.raw-graph-port-menu` is excluded from BOTH `shouldStartPan` and
    `handleSectionDoubleClick`, or tapping an item pans the canvas and a double-tap opens the
    create palette behind it. It renders outside `.raw-graph-stage`, which carries the pan/zoom
    transform — `position: fixed` inside a transformed ancestor resolves against that ancestor,
    so the menu would shrink with the graph and land in the wrong place. z-index 1250, under
    `.raw-topbar`'s band.
  - **One label field, not two.** The promote writes only `values.label` — the socket's name,
    and exactly what the inspector edits. The card keeps the type's own name ("In"/"Out").
    Writing both would let a rename diverge them permanently, and the socket would end up named
    by whichever happened to be read.
  - The port type is inherited from the port it came from, so the type picker is usually
    untouched.
  - The exterior-wire sweep needed no work here: it lives in the reducer's `deleteNode`
    (stage 5), so it already covers the Delete key, the delete FAB and any future route.
- **Seen, not assumed**: went inside a Desk holding a Cube, right-clicked the Cube's Color
  input, chose Expose — an `In` node appeared already wired (`port.in.value → geom.cube.color`,
  both inside the desk, no scope crossed), the notice read *"Desk now has a Color socket"*, and
  **Go and see** took me up to the root where the Desk card showed **Color (color)** after its
  five declared inputs. Zero console errors.
- Verified: lint 0 errors · 2286 tests · build clean.
