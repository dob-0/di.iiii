## 2026-09-03 — the Open Jam room, and the rule that keeps a room one

The owner, looking at the room thirty phones had edited in one night: *"fix the
open jam make it stylish it looks so poor and something there are overlap"*, and
then the real ask — *"some logic where someone will add something and it will not
mess again and it will be arranged … like in games, where you can build and where
you can't"*.

- **"Poor" was weight, not taste.** The fourteen photos were phone originals,
  18.5 MB for one wall, up to 2.7 MB each. On staging a visitor saw ONE photo
  while the rest crawled in, and read that as a broken room. `shrink-photos.mjs`
  makes 1280px copies (3.0 MB in all) and swaps them through the op log.
- **The trap under that:** the visitor page builds its image list from the
  DOCUMENT's own asset table (`buildAssetMap` reads `doc.assets`), so a file that
  is uploaded but not listed there renders as nothing at all. Every upload needs
  an `upsertAsset` op beside the `updateComponent`; the stale record goes with
  `deleteAsset`. Two rounds of "the photos are on the server and the wall is
  empty" came from exactly this.
- **"Overlap" was eye height.** The four steps and the QR stood in front of the
  walls, so they read straight through the photos behind them. There is no clear
  band up there — a portrait phone photo hangs from y 0.2 to 3.2. They lie on the
  floor now as a lectern, which is the only empty part of the entry frame.
- **Numbers measured rather than guessed**, after two wrong guesses cost a round
  each: an image plane is built **3 units TALL** and 3·aspect wide
  (`ImageObject`), then multiplied by the transform scale — so a uniform scale
  already gives an even hanging line and only a banner needs its width capped.
  A box's position is its **base**, not its centre (`BoxObject` renders at
  `position-y = size[1]/2`).
- **The phone frame is the entry camera's fov, not the layout.** One row of a
  wide wall shrank to a band across the middle of a portrait phone. Two rows and
  a tighter shot (fov 58 → 44, camera pulled in) let a phone see the back wall.
  The aspect fit gives a phone what a SQUARE viewport would see, so a subject
  wider than it is tall must be composed with that in mind.
- **Four grounds** in `compose-open-jam.mjs --style=`: `night`, `paper`,
  `blueprint`, `blue`. The owner picked *"paper + blue )) mix it"* — `blueprint`
  is that mix, and it is live on all three tiers.
- **Build zones** (#329) answer the real ask, and the room turns them on. The
  composer now places photos with `slotAt()` from `shared/placement.cjs` — the
  same module the server uses — so switching the rule on moves nothing and the
  next photo lands in the next free slot. The QR is `placement.pinned`: it is
  furniture on its lectern, not an exhibit for the wall to swallow.
- **The QR pointed at the wrong door.** It encoded `/open_jam`, the full Studio
  editor, which on the phone that scans it is six controls and no way through —
  the exact failure `/open_jam/scene` (JamSurface) was written to fix. The code
  was made before that surface existed. `set-jam-qr.mjs` rewrites it.

Prod writes are refused for a session, so the owner ran the two prod lines from
his own terminal; staging and local went through from here. Walked on all three
as a plain visitor, desktop and phone.
