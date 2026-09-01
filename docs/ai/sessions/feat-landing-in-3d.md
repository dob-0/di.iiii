## 2026-09-01 — the landing page is in the room, and the door is a camera move

- **`/` is the landing again, and the landing is the front door.** #283 made `/` open
  `main` directly on the grounds that the landing was only a picture of the room. It is
  not a picture of it any more: every element of the page now stands in that room at its
  own depth, and **Step inside** flies the camera off the flat view instead of
  navigating. `?room=1` opens the room bare. `/main` still heals to `/` — the owner's
  "i don't want have main" is untouched; the old link now resolves to the front door,
  which is the same room with a way in.
- **The UI is identical by construction, and it was measured.** Every element that flies
  is the same markup, cloned with its classes intact and rendered by `CSS3DRenderer` as a
  real DOM element carrying a 3D transform — there is no second implementation of the
  landing to drift from the first. A DOM snapshot of all **316 elements** under `.lp-root`
  (box, colour, font, opacity, visibility, z-index, text) taken before and after this
  branch differs on **5 rows, all of them the sampled opacity of the hero's own keyframe
  animation**. Nothing moved.
- **The equation the whole thing rests on**: put the camera at `D = viewportHeight /
  (2·tan(fov/2))` over a scene measured in CSS pixels and an object at `z = 0` lands on
  screen at its own pixel size. An element measured at `(left, top, w, h)` and placed at
  `x = left + w/2 − W/2`, `y = −(top + h/2 − H/2)` renders exactly where it already was,
  so frame zero of the flight is the frame before it. Depth is then free: push an element
  to `z` and scale it by `(D − z)/D` and the perspective cancels — the page is spread
  through space while it still looks flat, and only the camera reveals it.
- **The room behind the page is posed, not orbiting.** `LiveProjectScene` gained
  `cameraPoseRef`, a ref read inside `useFrame` — 60 poses a second through React state
  would re-render the scene on every frame. It rests on the space's own composed entry
  camera `[0, 3, 14.5] → [0, 1.2, −14]` and ends on the walker's pose `[0, 1.6, 6]`, so
  the last frame of the flight and the first frame of walking are the same pose and the
  handover has nothing to cover up.
- **`hideEntityTypes`, so the room stops saying what the page is saying.** The landing's
  HTML wordmark sat directly in front of the room's 3D one; two copies of the same three
  words, one behind the other, neither readable. The room's are hidden while the page
  speaks for them and given back on the first frame of the flight, which turns a
  collision into a handover. A rule about types, not a list of ids — the landing has no
  business knowing what the room's entities are called.
- Two traps worth keeping. **A clone keeps the cursor**: the button you just pressed
  stays `:hover` for the whole flight, and this button's hover is white, so the cyan door
  turned white the instant it left the page — `.lp-in-space *` is now
  `pointer-events: none !important`. And **distance decides duration**: the flight covers
  a fixed number of metres, so a page hung 2.6m away was overtaken a third of the way in
  and the whole effect lasted under half a second. At 12m the crossing lands at about
  nine tenths, which is the difference between a page that comes apart and one that
  vanishes.
- Reduced motion gets the destination and no flight. A phone, which never mounts the 3D
  for a passive visit, arms the scene on the press and waits up to 1.2s for the chunk
  before flying.
- Guards: 6 in `pageInSpace.test.js` (the 1:1 equation, depth cancellation, clone-not-move,
  rest state, teardown), 7 in `enterFlight.test.js` (what is on screen is what flies,
  reduced motion, cancel restores the page exactly). `RootApp.test.jsx` and
  `LandingPage.test.jsx` rewritten to the new intent — the door no longer navigates and
  no longer asks for a session, and a modified click still opens a tab. The
  cancel-restores case was watched failing with the restore removed.
- **Verified by looking**, 1440×900 and 390×844: the resting page, the flight sampled at
  five points through `?flight=<ms>` (a new debug knob, same shape as `?inputdebug=1`),
  and the walk handover. Plus `/main`, `/?room=1` and `/?tour=1` live.

### Left open

- The hero's scrim was tuned against a dark tilted backdrop; the room now sits behind the
  copy as the brighter composed entry shot, and the body copy reads at lower contrast
  than it did. Worth a pass on `.lp-hero::after` before this goes anywhere near prod.
- The four featured-space buttons overlap each other at 390px. Pre-existing, visible on
  production today, untouched here.
