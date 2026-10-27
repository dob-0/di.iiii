# The pixel strip: a lamp that is N pixels in a line (2026-10-22)

Part of Light v3 wave 1, step 1.3 (`agent-reports-2026-10-22/light-one/PLAN.md` §2.3). Code: `serverXR/src/lighting/pixelstrip.js`.

## What it is
One lamp type, `pixel-strip`: N RGB (or RGBW) pixels in a line, a colour order, a start universe and address, drawn on the stage as a line and shown on Touch.
It is a **setting set, never a rig**: pixel count, order, start, cut, layout and the receiver's address all have defaults (`DEFAULTS`) and none is a constant.
The Hayfilm strip's real count, order and address are not known yet (rig survey, PLAN step 1.1); until then it is whatever it is told to be.

## Method (sources)
- A pixel is `order.length` channels (3 RGB, 4 RGBW). A universe holds 512 slots (E1.11), so 170 RGB or 128 RGBW pixels; a pixel is never split across universes, the rest of the universe is unused. WLED docs, "E1.31 / Art-Net realtime".
- Settings may lower that cut (`pixelsPerUniverse`, e.g. 150), never raise it.
- WLED reorders colours itself from its own LED setting, so the default order is RGB; a controller that passes data straight to the LEDs (WS2812 as GRB) needs its own order set here.
- Universe numbers are the desk's own, 0-based; messages say them from 1, like every page of the desk.
- Refused with a plain message: an address with no room for one pixel, a count or address out of range, a start or an end past universe 32768 (says how far it needed to go), an order that is not an arrangement of RGB(W), a receiver address that is not IPv4, a patch on top of a lamp or another strip (`force` stacks on purpose, as for lamps).

## Where it lives
- State: `state.strips` in the show file (saved with it, read back through `sanitizeStrips`). Routes: `GET /api/strips`, `POST /api/strips/add|update|remove|pixels`.
- Engine: strips render after the lamps and before raw holds, scaled by master and blackout (zero wins). A live frame (`/api/strips/pixels`, the door for video and other sources) beats the colour while it is younger than `frameTtlMs`. Test modes `walk`, `red`, `green`, `blue`, `white` show order and ends on the real strip.
- Output: the same frame leaves on the desk's own Art-Net/sACN route; a strip that names its own receiver (`output: { driver, host }`) rides the existing extra-device send and its universes then leave only there.
- Page: the stage draws the strip as a line of up to 64 dots along its own `layout` line; Touch shows a tile with the same dots, both from the DMX the page already holds.

## Not done here (owed)
- The strip type is not yet a file in `src/rigbuild/types/library/`: that library is generated from a manifest of fixed-footprint types with a 3D body each (`scripts/rigbuild/types.mjs`), and a test pins its count. A parametric kind needs a generator extension; until then `PIXEL_STRIP_TYPE` (served by `GET /api/strips`) is the one description.
- No form to add a strip on the page yet (routes only); `desk:bundle` / the node view are untouched.
- Readdressing a lamp onto a strip is refused only through `fixtures/add` and `fixtures/readdress`; auto-patch from a room (`rigpatch`) allocates around strips through `nextFreeAddress` but does not name them in flags.
