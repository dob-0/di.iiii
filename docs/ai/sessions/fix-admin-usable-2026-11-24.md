## Admin made usable: Tasks and shows as rows, 3D/2D maps that hold still (ledger N6446.1)
- Tasks and shows: each feed is a card (name, count, machine, age) with rows that carry the state edge of the colour legend, a table for column output, "Show all"; was a raw text dump. Parser `monitorFeedText.js` (6 tests).
- 3D map flicker fixed at the root (an open card moved itself off the pointer); a drag from a card turns the camera; the wheel zooms the Spaces world 3D. Known-fix entry + CSS guard tests.
- 2D map: far out, names draw at 12 px above their boxes where they do not overlap (was 4-6 px, cut); names in a box leave room for the kind glyph; the hint says "scroll" when the wheel zooms.
- Monitor tab bar gets its own row under 1800 px (it wrapped at 1536).
- Measured headless, 18 views x 3 sizes (1536x864 at DPR 1.25 and 1.667, 768x864): 0 items cut or past the edge, 0 page errors. Tests: preferences 28 files. Not tested: the owner's own screen.
