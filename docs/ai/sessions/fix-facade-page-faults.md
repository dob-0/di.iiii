## 2026-09-15 — Facade audit wave 3: the 2D page faults

Five faults from the 2026-09-14 facade audit's "wave 3, DIY look" list — the
functional ones, not the button-style/header unification (those go to sketches
for the owner, untouched here).

- **Space card thumbnails stuck at "INITIALIZING 0%":** not a boot-queue bug —
  a code-mode published project (`entryView: 'code'`) renders its own iframe
  in `PublicProjectViewer.jsx` unconditionally of `isPreview`, so a card's
  thumbnail booted the SAME heavy runtime the real page does. **First version
  of this fix (below, reworked 2026-09-16) replaced EVERY code-mode card's
  picture with a static placeholder — a regression, caught only by loading
  dev.diiii.xyz's real `/spaces` grid: br_id_ge, network and platform-recordar
  all painted their real content in 2-5s, and even `azd` (the piece the
  original finding named) painted fine when loaded directly — the original
  claim was reproduced against fabricated local test data ("Heavy Piece"),
  never against the real space.** Reworked: the card keeps mounting the real
  iframe immediately; only a piece that genuinely never shows a sign of life
  falls back, after a 10s window (`CODE_PREVIEW_PAINT_TIMEOUT_MS`), to a quiet
  stand-in (the space's name, square corners, no glow, no instructional
  copy — not the old "Custom page — open to view." text chip). "Sign of life"
  is real, not a guess: `presentationPreviewDocument.js`'s bootstrap script
  (already injected into every `srcDoc` code page) posts
  `PREVIEW_PAINT_CONFIRMED_KIND` the moment either (a) the page has no
  `<canvas>` at all — ordinary DOM/CSS content, first paint IS the whole page
  — or (b) a `MutationObserver` sees the DOM around a canvas change even
  once — a loading indicator ticking or being removed. Silence forever is
  genuinely ambiguous (finished-and-static reads identically to hung-forever
  from outside), which is why the timer stays as the backstop rather than a
  real "done" signal. This only works for `rawHtml` (an `<iframe srcDoc>` this
  app wraps itself); a `codeUrl` page (`src=`, someone else's whole site,
  truly cross-origin) can never be instrumented and is never timed out —
  `allow-same-origin` would answer the "did it paint" question but also hands
  the arbitrary page this origin's real storage and DOM reach, a trade only an
  author's own `deviceAccess` opt-in makes, and one that changes nothing for a
  different origin anyway. Not fixable further without widening the sandbox.
  Verified against real content: fetched br-id-ge/network/platform-recordar/
  azd's actual published `srcDoc` HTML from dev.diiii.xyz (read-only GET, `di`
  install untouched) and republished it into throwaway local spaces — all four
  kept their live picture; a synthetic space carrying a genuinely-frozen boot
  screen (canvas painted once, never touched again) correctly fell back after
  10s. Screenshots desktop 1440×900@2x + phone 390×844@3x, Chromium
  (`--disable-gpu --use-angle=swiftshader`) and Firefox.
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
(a code preview shows the live iframe immediately; a stuck one swaps to the
quiet stand-in only after the paint window; a confirmed one never swaps out
no matter how long the window runs — the regression guard for the first
version's bug), `src/utils/presentationPreviewDocument.test.js` (the injected
paint-watcher: immediate for no-canvas content, silent for a canvas page whose
DOM never changes, confirmed on the first DOM change, never runs outside
`?preview=1`).

Nothing else from the wave-3 list (room bevel title, red ring, leftover white
planes, four button styles, three headers) was touched — those are design
choices the task explicitly routes to sketches for the owner, not faults.
