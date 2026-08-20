## 2026-08-21 — the Public page as a node, and two windows that were lying about themselves

Built for a children's workshop in Dilijan, where the whole week's work is authored in
Raw and taken home as a published link. Three things were in the way.

- **`view.publish` — the public page as a panel node.** Entry view, headset default,
  camera/mic opt-in, and the address with a copy button. Deliberately not Studio's
  `PublishPanel` imported across the lane boundary: that one is MUI and Raw loads
  neither MUI's styles nor the control cluster's, so it would render as a column of
  unstyled text — the same ruling `CreatePanelWindow` already made. Everything on it is
  a document op, so a guest holding a redeemed invite can use it. The two space-level
  switches (make public, set live project) are owner-or-admin and would 403 for exactly
  that person, so they are not rendered as buttons that always fail; the space's state
  is reported as a sentence instead. `shareEnabled` is absent on purpose — grep it,
  nothing on the published page reads it.

- **A Text window could not be written in.** `TextPanelWindow` rendered a `<p>`. A desk
  seeded with "Our room is about ______" was an instruction nobody could obey, and the
  only way to change a note was the inspector or a one-line port field on a card that
  may be off-screen or past the LOD threshold. It is a textarea now, writing through
  `updateNode` — per keystroke, which is what the surrounding code already does and what
  the sync throttle and the history's same-field coalescing are built for. When an edge
  feeds `content` the box stays read-only and says who is holding the pen: the wire wins
  on every evaluation, so an editable box there would swallow the typing.

- **A minimized window was placed by the panel it would open to.** `clampWindowFrame`
  reserved the stored full height for a collapsed bar, so a bar authored near the bottom
  was yanked up onto whatever sat above it. Measured on a 1440x810 desk: three bars
  authored at y=640 landed at 392, 248 and 94, stacked on the row of cards and on each
  other.

  **The part worth remembering:** the first fix was in `clampWindowFrame`, with a unit
  test over `clampWindowFrame`, and it passed while every window on screen stayed
  exactly as wrong as before. `DesktopWindow` rebuilds the frame it clamps from
  x/y/width/height alone, so the `minimized` the clamp reads never arrived — the guard
  sat one layer above the break. The real fix carries `minimized` in the window's draft;
  the guard now renders a `DesktopWindow` and reads where it actually lands (64 before,
  580 after, in jsdom's 1024x768). A test of the helper is not a test of the surface.

Also: `docs/ai/known-fixes.md` rows for both window defects, and wiki entries for the
Public page window and for writing on a Text window.

Not done here, and not this branch's business: the guest session cookie is stamped with
`config.authSession.ttlMs` (12h) regardless of the caller's ttl, so `GUEST_SESSION_TTL_MS`
(7 days) never reaches the browser and every returning guest is a new subject; and the
upload limiter is keyed by IP, so a venue behind one NAT is a single 60-per-10-min
bucket. Both verified against staging, both fixable in a line, both filed.
