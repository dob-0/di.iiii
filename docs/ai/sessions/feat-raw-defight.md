# feat/raw-defight — the cards stop fighting the room

The remaining half of "still conflict with backdrop display and geo"
(owner, 2026-08-20): the graph layer and the room fought for the same
pixels, by construction.

## What changed

- A spatial node lands IN THE ROOM at the click — and its card used to land
  centred on the very same click, burying the thing it had just made (the
  audit photographed a cube hidden behind its own Cube card). The card now
  steps ~90px below the click, so what you placed stays visible above it
  (handlePaletteCreate; regression test compares a Cube's card Y against a
  Number's from the same click).
- Selection pills off in the backdrop (`showSelectionPills={false}` threaded
  through RawViewport → SceneContent → NodeVisual/EntityVisual): the card is
  the selection feedback there, and the floating name pill duplicated it in
  the room's sky, detached from its object — the "GEO" chip. Fullscreen Room
  and /out keep their behaviour (pills on selection where cards are absent;
  /out has no selection at all).

## Verify

Same journey as the clear-desk probe, read at DPR 2: Geo placed → footprint
visible, no sky chip; cube placed inside → cube stands fully visible above
its card.
