## 2026-08-19 — a door you can see, and something that says where you are

- Stage 2 of the container work. Stage 1 fixed "can't put the geometry in"; this fixes the
  other half of "can't go inside" — which turned out not to be blocked at all. You could
  always go inside. Nothing ever told you that you had.
- **What entering a World looked like before**: a chromeless fullscreen empty grid with one
  20px icon in a corner. No name, no breadcrumb, no visible exit, every card gone from view.
  A person doing that does not think "I am inside the World"; they think they have destroyed
  their workspace. Screenshotted before touching anything.
- **Why**: the breadcrumb EXISTS. `chromeVisible` starts with `if (zen) return false` and a
  fresh workspace opens in zen, so the whole topbar is hidden; and `handleEnterNode` sets
  `isWorldFullscreen(true)` for `universe.world`, stripping what was left. Machinery present,
  never on screen.
- **What shipped**
  1. A scope marker — `‹ inside <name>` with a real exit — rendered whenever `navStack.length
     > 1`, deliberately OUTSIDE the chromeVisible gate so zen and fullscreen cannot hide it.
     34px controls, because leaving is the one thing a lost person needs and a phone has no
     Escape key.
  2. Cards say what they hold. `childCounts` (optional, defaulted — Studio wraps this
     component read-only and passes nothing) puts a count badge on a card with contents and
     brightens its chevron. Before, `math.add` and `studio` wore the identical mark.
  3. The enter control is no longer gated at `CARD_CONTROL_MIN_ZOOM` (0.5) for a card that
     holds something. The auto-fit lands an oversized graph at `FIT_MIN_USEFUL_ZOOM` (0.34),
     so the way into a container vanished exactly when the "showing N of M" notice appeared.
  4. Chevron contrast raised from rgba(244,247,251,0.2) — about 1.6:1, under the 3:1 floor
     for a non-text control.
- **The measured phone bug, and the assumption that hid it.** `starterWorkspace.js` says in
  its own comment that both windows must finish in the top half and "the test asserts it" —
  asserted at viewportHeight 844. A real iPhone 13 hands the page **664** once browser chrome
  is taken. Measured with `elementFromPoint` on three devices:
  - iPhone 13 (390x664): 1 of 4 cards reachable — Studio, the card the welcome text tells you
    to tap, sat under the welcome window
  - iPhone SE (320x568): 1 of 4
  - Pixel 7 (412x839): 4 of 4
  The seed's own `2y + h <= vh` invariant HOLDS at 664 — it is necessary, not sufficient. What
  separates the working sizes from the broken ones is absolute pixels below the windows
  (318/314 vs 250/198), not a fraction: a card's height does not scale with the phone. So
  `CARD_BAND_MIN = 300`, below which the welcome note opens as a header only — still there,
  still one tap from expanding, and no longer sitting on the instruction it gives.
  After: iPhone 13 3/4, iPhone SE 2/4, Pixel 7 4/4, and **Studio reachable on all three**. The
  one still covered is Sky, a colour value with nothing inside it, whose door means nothing.
- Two wrong rules were tried and discarded by measurement before this one: "finishes in the
  top half" (minimised the note on roomy phones too) and the file's own `2y+h` invariant
  (left iPhone 13 at 1 of 4). Neither was shipped.
- **Seen**: desktop and iPhone 13. Entered Studio, saw `‹ inside Studio`, clicked out, got all
  four cards back. Entered a World on the phone — the case that used to blank the screen — and
  the marker is there over the fullscreen grid, 34x34, reachable, and gets you out.
- Verified: lint 0 errors · 2246 tests · build clean.
- Still open, and unchanged by this: every container declares zero outputs, so a wire cannot
  start from one. That is the In/Out doorway work.
