# open / tools

The Open Jam room (`open/open-jam`) is what visitors left behind at the 2026-07-21 jam:
phone photos, a QR, four written texts — and the default cones, spheres, lights and
"New Text" they dropped while finding the editor. These two scripts turn that into a
room, through the op log (never a bare document write), one tier at a time:
local → staging → prod, on the owner's word.

    node spaces/open/tools/curate-open-jam.mjs  <api> <token> [--apply]           # keep the real things, drop the leftovers
    node spaces/open/tools/shrink-photos.mjs    <api> <token> [--apply]           # 1280px web copies, swapped in through the op log
    node spaces/open/tools/compose-open-jam.mjs <api> <token> wall|floor [--style=night|paper|blue] [--apply]

Both dry-run by default and print keep / remove / move before touching anything.
**Why the room looked poor on staging (2026-09-03):** the 14 photos were phone
originals, 18.5 MB in all, so a visitor saw one photo while the rest crawled in.
`shrink-photos.mjs` cuts that to 3 MB. It also registers each copy with an
`upsertAsset` op — the visitor page builds its image list from the document's own
asset table (`buildAssetMap` reads `doc.assets`), so an uploaded file that is not
listed there renders as nothing at all.

Rendering facts that shaped the numbers: an image plane is 3 units TALL and
3·aspect wide, then multiplied by the transform scale — so a uniform scale gives an
even hanging line and only a banner needs its width capped. A box's position is its
BASE, not its centre. Text standing at eye height in front of the walls reads
straight through them; the floor in front is the only empty part of the entry frame,
so the code and the four steps lie on it as a lectern. Every light draws a small
helper sphere where it stands: keep them high and behind the camera.
 images and 2d texts lie flat by default
(rotation [π/2,0,0] stands one up facing +z; [π/2,0,∓π/2] turns it to face ±x); text
scale runs about five times image scale; `billboard:true` does nothing in the visitor
view; the sun light draws a small sphere helper, so it sits behind the camera.
