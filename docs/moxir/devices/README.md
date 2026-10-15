# MOXIR devices — one datasheet per kind (owner's hard rule 2026-10-15: "write a hard rule that remembers things well — we had all that on hand and now we research again")

Read THESE before any search about a device. One file per kind; every fact carries its source and date; "TESTED" means walked on a real unit,
"ASSUMED" means from a chart of a look-alike, "APPROVED" means the owner's eye and word (2026-10-15), "ARCHIVED" means kept with its reason and never the default, "CANDIDATE" means a maker's manual that may be the unit (none left for the U-Plus kinds).
Rig: `scripts/place/rigs/moxir-v2-11-2026-10-15.json` (`kit`, `fixtures[].part`). Desk map of the heads: `src/rigbuild/fixtureTypes.js`.
Map check: `docs/moxir/b380f-16ch-map-check-2026-10-09.md`. Archived equivalent chart: `scripts/place/fixtures/fixtures.json` → `archive.PROST380`.

| kind | what | count | where | channels | chart status | file |
|---|---|---|---|---|---|---|
| UP-PL5403 | LED wash 54×3 W RGBW, 15–25° (U-Plus IP PAR-54X3) | 40 | road 8 · entrance 2 · lines A–D 12 · L/R 6 · truss 11 · key 1 | 8 | APPROVED (owner 2026-10-15), manual 2024-01 | up-pl5403.md |
| UP-B380F | 380 W IP65 beam moving head (U-Plus IP65 380W Beam) | 18 | plane 1 (6) · side lines (12) | 16 | APPROVED (owner 2026-10-15): "380 IP BEAM" manual chart; the 10-09 walk ARCHIVED (`walk-2026-10-09`) | up-b380f.md |
| UP-LA40WF | 40 W RGB laser, DMX/ILDA (U-Plus IP-LL40) | 2 | entry, crossing lines | **32** | APPROVED (owner 2026-10-15), manual IP-LL30 2025-03; graphic for a dot ASSUMED | up-la40wf.md |
| UP-YZ31P | hazer | 1 | the air | 1–2 (ASSUMED) | none found (U-Plus IPH1500 page, no manual) | up-yz31p.md |
| LaserCube Ultra Mk2 | 7.5 W RGB laser cube, network | 6 | back crane girder, the comb | — (not DMX) | manual v1.0 (NOHD), driven live 10-14 | lasercube.md |

Sevan's own DMX lists (the owner, 10-15: "we have all list DMX from Sevan") are NOT in the di.bo inbox; when they arrive they replace every ASSUMED row here.

**Maker (owner's eye, 2026-10-15 16:3x):** UP-PL5403, UP-B380F, UP-LA40WF and UP-YZ31P are U-Plus Lighting (`maker` in fixtures.json and the type library; model and manual per kind). Charts with value ranges: `scripts/place/fixtures/charts/`. The rig's `kit_makers` block lists maker/model/manual per kind. The project's `rentalList` has no maker/model field in its schema (`normalizeRentalList`, src/shared/projectSchema.js + the server twin): the equipment sheet reads the maker from the type library.

## Setup-day check list (owner's approvals 2026-10-15 17:1x)
1. **B380F pan on ch 10 vs ch 1.** Send pan on ch 10 (the manual's order, the desk's default). If the head does not move and ch 1 moves it, switch the 18 fixtures to mode `walk-2026-10-09` and say so. No lamp is struck by either chart: ch 16 stays 0 (lamp on = 101–255 is a 3-second strike).
2. **PL5403 8-ch mode set on the unit** (A001 on its display). 40 units, U2 = 40 × 8 = 320 of 512.
3. **LA40WF 32-ch mode set in its menu**, laser lock and ILDA lock checked, the key and E-stop in place; then walk ch 3 to find which graphic is a single line or dot (graphic 1 = value 0 is the ASSUMED one). U1 = 18 × 16 + 2 × 32 + 1 = 353 of 512.
