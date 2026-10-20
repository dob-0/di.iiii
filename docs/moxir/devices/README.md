# MOXIR devices — one datasheet per kind (owner's hard rule 2026-10-15: "write a hard rule that remembers things well — we had all that on hand and now we research again")

Read THESE before any search about a device. One file per kind; every fact carries its source and date; "TESTED" means walked on a real unit,
"ASSUMED" means from a chart of a look-alike, "APPROVED" means the owner's eye and word (2026-10-15), "ARCHIVED" means kept with its reason and never the default, "CANDIDATE" means a maker's manual that may be the unit (none left for the U-Plus kinds).
Rig: `scripts/place/rigs/moxir-v2-11-2026-10-15.json` (`kit`, `fixtures[].part`). Desk map of the heads: `src/rigbuild/fixtureTypes.js`.
Map check: `docs/moxir/b380f-16ch-map-check-2026-10-09.md`. Archived equivalent chart: `scripts/place/fixtures/fixtures.json` → `archive.PROST380`.

| kind | what | count | where | channels | chart status | file |
|---|---|---|---|---|---|---|
| UP-PL5403 | LED wash 54×3 W RGBW, 15–25° (U-Plus IP PAR-54X3) | 40 | road 8 · entrance 2 · lines A–D 12 · L/R 6 · truss 11 · key 1 | 8 | APPROVED (owner 2026-10-15), manual 2024-01 | up-pl5403.md |
| UP-B380F | 380 W IP65 beam moving head (U-Plus IP65 380W Beam) | 18 | plane 1 (6) · side lines (12) | 16 | APPROVED (owner 2026-10-16): the PRINTED manual with the unit, pan ch 1 — photos in photos/; the 10-15 PDF chart (pan ch 10) ARCHIVED | up-b380f.md |
| UP-LA40WF | 40 W RGB laser, DMX/ILDA (U-Plus IP-LL40) | 2 | entry, crossing lines | **32** | APPROVED (owner 2026-10-15, IP-LL30 PDF) + the PRINTED manual (owner 2026-10-16) agrees row for row; static beam ch 2 = 250 | up-la40wf.md |
| UP-YZ31P | hazer | 1 | the air | 1–2 (ASSUMED) | none found (U-Plus IPH1500 page, no manual) | up-yz31p.md |
| LaserCube Ultra Mk2 | 7.5 W RGB laser cube, network | 6 | back crane girder, the comb | — (not DMX) | manual v1.0 (NOHD), driven live 10-14 | lasercube.md |

The owner's photos of the printed manuals (2026-10-16 16:22, di.bo) are in `photos/`: beam pp. 13–15, laser 19/32 ch + LCD menu. Sevan's own DMX lists are still not in the inbox; when they arrive they confirm the ASSUMED rows (YZ31P) — the beam and the laser now have their units' printed charts.

**Maker (owner's eye, 2026-10-15 16:3x):** UP-PL5403, UP-B380F, UP-LA40WF and UP-YZ31P are U-Plus Lighting (`maker` in fixtures.json and the type library; model and manual per kind). Charts with value ranges: `scripts/place/fixtures/charts/`. The rig's `kit_makers` block lists maker/model/manual per kind. The project's `rentalList` has no maker/model field in its schema (`normalizeRentalList`, src/shared/projectSchema.js + the server twin): the equipment sheet reads the maker from the type library.

## The ESP controller's universe (owner at the venue, 2026-10-16 04:xx — patched on the node, read back)
Node `vizzz.di_BA6FCC` (ESP32 + MAX485, AP 192.168.4.1, one universe = "Universe 1" on its desk, Art-Net 0). Order as the owner wired it, addresses as he set them on the units:

| # | kind | addresses | mode | where (his words) |
|---|---|---|---|---|
| 1 | UP-B380F beam | 1–16 | 16ch | the truss, first |
| 2–11 | UP-PL5403 wash ×10 | 17–96 | 8ch | the truss, "17 till the end" |
| 12 | UP-B380F beam | 97–112 | 16ch | the truss, last — "the truss is finished" |
| 13–17 | UP-PL5403 wash ×5 | 113–152 | 8ch | after the truss (place not said yet) |
| 18… | UP-B380F beam ×1 or ×11 | 153–168 or 153–328 | 16ch | OPEN: "then 11 beam again" — 1 or 11, asked |

Patched 04:3x with the node's generic profiles (beam = `dimmer` on its ch 3, wash = `drgbw`); the real charts are node profiles
`up-b380f-16` / `up-pl5403-8` in vizzz.di branch `feat/uplus-profiles-2026-10-16` (re-patch: repatch.sh in that PR). The rig file
(`moxir-v2-11-2026-10-15.json`) still carries the old cut patch (11 washes on NODE-STAGE-B U2 1–88, no beams on the cut): which two of
the 18 beams and which 10 of the 40 washes are on the truss, and where the 5 washes stand, is the owner's word — owed as ledger rows.

## Setup-day check list (owner's approvals 2026-10-15 17:1x)
1. **B380F pan on ch 1** (the printed manual with the unit, 2026-10-16 = the 10-09 walk). Send pan ch 1 / tilt ch 2; the head must follow. If not, that unit is in another mode on its display. Ch 11–16 (prisms, focus, reset) are named by the manual, not walked: step one unit 0..255 per channel.
2. **PL5403 8-ch mode set on the unit** (A001 on its display). 40 units, U2 = 40 × 8 = 320 of 512.
3. **LA40WF menu 23 = 32ch, menu 1 = 401 / 433, menu 8 = Black** (the unit's own LCD menu, up-la40wf.md), laser lock and ILDA lock checked, the key and E-stop in place; then walk ch 3 to find which graphic is a single line or dot (graphic 1 = value 0 is the ASSUMED one). U1 = 18 × 16 + 2 × 32 + 1 = 353 of 512.

## The patch as the owner set it in the plot (2026-10-16 20:3x–21:1x, moxir-v2-11 v260 → v370, read back)
Set by the owner in `/moxir/plot/moxir-v2-11` "as it is in real life"; two fixes at his word (v262): truss wash `rig-par-cut-06` → U1 89–96,
`rig-par-cut-07` unpatched (the 3D truss has 11 washes, the real one 10). Universe 1: truss beam 1–16 · 10 truss washes 17–96 · truss beam 97–112 ·
5 ground washes 113–152 · 5 left-side beams 153–232 · 6 plane beams 233–328 · 18 washes 329–472. Universe 2: UP-LA40WF 1–32 / 33–64 · 5 washes
73–112 · 5 right-side beams 113–192 · 1 hung wash 217–224. No address: 1 wash (cut-07) + 36 LaserCube lines (LAN by design).
Venue facts (owner, 21:0x): the 6 LaserCubes hang on the BACK WALL, not on the crane (lines set on the wall's inner face z −53.4, physics 0/96);
the crane is parked at the upper entrance with nothing on it and is not in use.
Two sides (owner, 21:2x): the patch (real DMX) and the simulation are separate — scenes pick lamps by kind and place, never by address
(measured: the unpatched cut-07 is posed in 53/53 scenes, lit in 31), so scenes are written before a lamp is patched. Owed: this rule in RIG_BUILD.md.
