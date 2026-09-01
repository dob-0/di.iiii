## 2026-09-02 — di.desk, first increment

The owner: *"i like the di.desk in crypto working area is better than the raw… change it
to di.desk and just move the nodes in desk"*. Settled with him: rebuild from that desk,
merge the node families for real, and **keep Raw reachable meanwhile**.

- **`/<space>/desk` is a new shell, not a new window system.** Raw already draws windows —
  `DesktopWindow` handles drag, resize, minimise and the frame clamp, and the room has
  been a window since #188. What the crypto desk (`~/di-crypto/desk/public/desk.html`) has
  that Raw does not is the *shell*: an endless surface, windows as plain hairline
  rectangles with a mono label, an add menu written as sentences, named layouts, and two
  arrangements of one desk. That is what was brought over.
- **`canvas` and `grid` are two ways of looking at the same desk.** Grid never writes back
  to a window's own position, so switching back finds the desk exactly as it was left —
  the same relationship Studio and Raw already have with one project, and the landing with
  the room.
- The add menu reads `note — free text`, `room — the space, live`, `graph — the nodes`.
  Sentences, not a taxonomy: the palette is the thing the owner called "mess" in Raw, and
  a list of 113 types sorted into 15 categories is still 113 types.
- Raw is untouched. `/<space>/raw` keeps working; nothing is withdrawn while the desk
  earns its place.

### Three bugs found by looking, all of them mine

- **`GridFloorBackground` is `position: fixed`** — it is a page background, and a room
  standing in a window is not a background. It painted over the desk and every window on
  it. New `contained` prop; the landing's use is untouched.
- **`DesktopWindow` has no look of its own** — it depends on `raw.css`, 5062 lines this
  route does not load, so every window rendered as unstyled text with default buttons.
  The desk dresses them itself, scoped under `.desk-root`, forty lines.
- **The grid overlapped by exactly 48px.** `DesktopWindow` clamps every frame to
  `DEFAULT_RAW_WORKSPACE_TOP = 64` and will not be argued with, so row 0 was quietly
  pushed down while row 1 stayed where the maths put it. The desk now lays out to the same
  floor the windows are held to. Measured in the browser, not eyeballed — three rects, one
  overlap, then none.

Also fixed while writing the guard: row heights are measured in a first pass, because
accumulating them while placing positioned row 1 against a row-0 height that had not
finished being measured.

### Not yet

Nothing persists. A desk that forgets is obviously unfinished; a desk that remembers in
the wrong place is a trap that outlives the session, so `localStorage` was deliberately
not used — layout belongs in the document's `workspaceState`, through the op log, and it
lands with the document wiring. The `graph` window says the nodes move in next rather than
pretending to be empty.

Guards: 8 in `deskLayout.test.js` — placement never stacks, the grid clears the tallest
window in the row above and starts at the clamp floor, grid does not mutate the desk, and
`see it all` brings every window inside the viewport.

**Looked at**, 1440×900 DPR2: empty desk, the add and layouts menus, the workbench layout
with the room drawn live in its window, and the grid arrangement — before and after each
fix.
