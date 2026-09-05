## 2026-09-06 — a visitor to /spaces sees the spaces

- `/spaces` folded the platform's public spaces behind a "▸ 9 other spaces" line and
  gave half the first screen to an empty Guest Sandbox card reading "nothing in it
  yet". The page whose whole point is the public spaces was showing a stranger one
  space and a toggle.
- A visitor (guest session or signed out) now gets ONE grid holding every space the
  server listed for them, open on arrival, no collapse to find. The Open Space is one
  card among the others and keeps its Live badge and its line ("everyone builds here,
  together").
- Order inside that grid: the spaces with a cover image or a published project first,
  the bare ones after, otherwise the server's own order. It only demotes blank cards;
  nothing is ever hidden, and no space is singled out by name in code.
- The guest sandbox stops being a hero card: one quiet line under the grid — "Your
  private sandbox — only you see it" — that opens it in one click. It is a scratch
  place of your own, not one of the places to visit.
- Guest banner cut to one sentence: "Guest session — step into any space here, or sign
  in to make one that is yours."
- The "View live" badge is hidden for visitors. On a visitor's page every card is a
  public space they cannot edit, so it said nothing twice and wrapped card headers
  onto two lines next to "Live".
- A cover image whose asset is missing now falls back to the space's live preview
  instead of drawing the browser's broken-image glyph (`algovrithm`'s cover asset is
  404 on prod — the card was showing a torn picture the moment it stopped being
  hidden).
- The signed-in view is untouched: three shelves (Open Space · Your sandbox · Your
  spaces), Open Space and the sandbox side by side from 1024px up, every management
  action where it was. The Grid/Map toggle works in both, and Map is still handed the
  full space list including the sandbox.
- The collapse state and its localStorage key are gone — nothing else used them.
- Wiki: the article "The Open Space, your sandbox & guest mode" described the old fold;
  it now describes both views.
- Seen, not just tested: guest at 1440x900 DPR2 and 390x844 DPR3, the Map view, and a
  signed-in account view, all read correctly. Note for later: with ten cards the live
  thumbnails boot two at a time, so the last cards in the grid stay dark for a while
  before they paint — each one does render when it gets its turn.
- For the owner, data not code: `dilijan` is public on prod's API and so now shows on
  the front of /spaces, though the camp space was meant to live on staging only. Fix
  it with `isPublic`, not with a name in the code.
