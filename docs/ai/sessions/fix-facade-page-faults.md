## 2026-09-15 — Facade audit wave 3: the 2D page faults

Five faults from the 2026-09-14 facade audit's "wave 3, DIY look" list — the
functional ones, not the button-style/header unification (those go to sketches
for the owner, untouched here).

- **Space card thumbnails stuck at "INITIALIZING 0%":** not a boot-queue bug —
  a code-mode published project (`entryView: 'code'`) renders its own iframe
  in `PublicProjectViewer.jsx` unconditionally of `isPreview`, so a card's
  thumbnail booted the SAME heavy runtime the real page does (found `azd`'s
  piece, whose own THREE.js GLTFLoader boot screen literally reads
  "INITIALIZING SPACE... 0%" and never advances behind the sandboxed iframe's
  opaque origin). The scene/graph renderers already get a `lowPower`/no-nav/
  no-timelines preview mode; code view had no such gate. Fix: a code-mode page
  in `?preview=1` now renders a static "Custom page — open to view." placeholder
  instead of mounting the iframe at all, and signals `dii:preview-ready`
  directly. Clicking the card still opens the real thing (`SpaceCardLive`, no
  `?preview=1`), unchanged. Reproduced the exact frozen text locally by
  publishing a throwaway space with a copy of the stuck boot HTML, confirmed
  the placeholder replaces it, confirmed a live (non-preview) load is untouched.
- **Visitor sees "Only you 0":** the server only ever lists PUBLIC spaces to a
  signed-out visitor (`spaceRoutes.js`'s `visible` filter), so the "private"
  filter count can never be anything but 0 for them — an owner-only concept
  with no possible use, shown anyway. `SpaceHub.jsx` now hides that filter
  chip for a visitor, and treats a stale `private` pick left in localStorage
  from an earlier signed-in session as `all` rather than silently filtering
  the whole page down to a filter that no longer exists on screen.
- **Map shows 14, grid shows 13:** the map (`SpaceConstellation`) was handed
  the raw `spaces` state; the grid counts `arrangeable`, which drops a
  visitor's own private guest sandbox ("not one of the spaces to visit").
  Map now gets `arrangeable` too — same set, same count, everywhere on the
  page. Grid was already right; map was the one out of step.
- **Login copy "This copy cannot send mail":** "copy" as in "this installation
  of the software" reads as internal jargon to a visitor. Reworded to say
  what's actually true for them: "Email sign-in isn't available on this
  install — if you forget your password, ask an admin to reset it."
- **`algovrithm` counted under "Needs a door":** `src/algoVrithm/` (a
  registered *work*, `src/works/works.js`) owns its bare URL segment before
  any space lookup runs, so its door always opens onto the piece regardless of
  the space's own `publishedProjectId` — that field describes a project
  published INTO a space, which a work never uses to answer its own route.
  `spaceState()` in `spaceArrange.js` now treats any work-shadowed space as
  `open`, never `nodoor`, whether or not it has a published project. The space
  row itself is untouched — this was a display-classification fix only, not a
  data change, and the owner hasn't decided anything about the row itself.

Verified signed-out, desktop 1440×900@2x and phone 390×844@3x, Chromium
(`--disable-gpu --use-angle=swiftshader`) and Firefox via Playwright, against
a local dev build on this branch. Screenshots (before/after) in
`/tmp/claude-1000/-home-dob/b69f5f5e-f9bb-4a70-9940-5c2a0a65dac0/scratchpad/pages/`.

Tests: `src/studio/utils/spaceArrange.test.js` (work-segment state, updated
`nodoor` fixture off the real `algovrithm` id), `src/studio/components/SpaceHub.test.jsx`
(visitor filter chip hidden, map/grid set parity — the old Map test asserted the
bug as intended behavior and is corrected), `src/project/components/PublicProjectViewer.test.jsx`
(code-preview placeholder, and that a live/non-preview code page is unaffected).

Nothing else from the wave-3 list (room bevel title, red ring, leftover white
planes, four button styles, three headers) was touched — those are design
choices the task explicitly routes to sketches for the owner, not faults.
