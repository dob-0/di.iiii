## 2026-09-06 — the network field gets its depth and its connection back, on paper

- The owner: *"we have the connection in 3d where is that we worked and it lost"*, *"i want to
  mix of 2d + 3d mix"*. The 09-03 rebuild had flattened the field to a bracket drawn in the
  roster's right margin — no depth, no interaction. It is a cloud again, and still one sheet
  of paper: the black panel that caused the original seam does not come back with it.
- `/network` is now two columns: the roster keeps the left, the field takes the right and
  sticks to the viewport while the list scrolls past it.
- **Depth.** The fifty-two are points on a Fibonacci sphere — the five who run it in a tight
  core, the forty-seven on a shell around them, each at a deterministic distance so the shell
  has thickness. A perspective divide puts them on the canvas: nearer points are larger and
  darker, farther ones smaller and paler. It drifts slowly at rest, so it reads as a solid.
- **No library.** `spaces/network/lib/field.client.js` is arithmetic on the 2D canvas the page
  already had. The three.js version this replaces cost 229 KB over 36 requests to draw the
  same fifty-two dots; the whole field is now ~11 KB inlined in the page, one request.
- **Turn it.** Drag rotates: horizontal is yaw, vertical is a shallow pitch that cannot tip
  the cloud onto its side, with a small inertia. `prefers-reduced-motion` gets one static
  angle and no drift — verified, the canvas is drawn and does not move.
- **Connection, both ways.** Hovering or focusing a roster row lights its point, the points it
  shares work with, and the lines between them; hovering a point lights its roster row and
  writes the names on the canvas. Lines are drawn only where work is shared, bundled to one
  meeting point per work, and the work's name sits there. Labels are placed last and out of
  each other's way — a name that lands on another name is two marks that cancel.
- **The room lifts.** On a lit point a small paper card carries name, role, how much work
  stands in that room, and `→ room`. Clicking the point clicks the roster's own link, so the
  top-level navigation a published page is allowed comes from a real link click — verified:
  a click in the field lands on `/network/<slug>`.
- **Phone.** Below 1000px the field is a quiet 240px strip between the masthead and the
  roster: it drifts, it takes no drag, it lifts no card, and a vertical gesture over it
  scrolls the page — verified. The howto line drops "drag the field to turn it" at that width.
- The keyboard path is unchanged: the roster is the interface, the field has no tab stop, and
  the card's link is out of the tab order because the card is only up under a pointer.
- Guards: `network-pages.test.js` still passes all 14 — the `--accent`-marks-only rule, the
  12px floor, one non-module script on the index, no library, no script in any room. Canvas
  colours are read from the same CSS tokens, so the rule holds in the drawing too.
- Seen on the LOCAL tier through the app, walked with `page.frames()` (the published page is a
  srcdoc iframe): rest, row hover, point hover with the card, after a drag, keyboard focus,
  reduced motion, and the phone strip. Zero console errors in the frame.
- Left for later: `/network/constellation` keeps its paper ring untouched in this change — it
  could take the same field, and it is the obvious next place for it. Hovering a point lights
  a roster row that may be scrolled out of view; the card carries the name, so nothing is
  lost, but the list does not follow the field.
- Not pushed past local. Staging next, prod on the owner's word.
