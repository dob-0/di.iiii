# open / tools

The Open Jam room (`open/open-jam`) is what visitors left behind at the 2026-07-21 jam:
phone photos, a QR, four written texts — and the default cones, spheres, lights and
"New Text" they dropped while finding the editor. These two scripts turn that into a
room, through the op log (never a bare document write), one tier at a time:
local → staging → prod, on the owner's word.

    node spaces/open/tools/curate-open-jam.mjs  <api> <token> [--apply]          # keep the real things, drop the leftovers
    node spaces/open/tools/compose-open-jam.mjs <api> <token> wall|floor [--apply] # stand the photos up as three walls (or lay them as a mosaic)

Both dry-run by default and print keep / remove / move before touching anything.
Rendering facts that shaped the numbers: images and 2d texts lie flat by default
(rotation [π/2,0,0] stands one up facing +z; [π/2,0,∓π/2] turns it to face ±x); text
scale runs about five times image scale; `billboard:true` does nothing in the visitor
view; the sun light draws a small sphere helper, so it sits behind the camera.
