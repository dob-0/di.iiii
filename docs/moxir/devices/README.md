# MOXIR devices — one datasheet per kind (owner's hard rule 2026-10-15: "write a hard rule that remembers things well — we had all that on hand and now we research again")

Read THESE before any search about a device. One file per kind; every fact carries its source and date; "TESTED" means walked on a real unit,
"ASSUMED" means from a chart of a look-alike, "CANDIDATE" means a maker's manual that may be the unit (the owner's eye decides).
Rig: `scripts/place/rigs/moxir-v2-11-2026-10-15.json` (`kit`, `fixtures[].part`). Desk map of the heads: `src/rigbuild/fixtureTypes.js`.
Map check: `docs/moxir/b380f-16ch-map-check-2026-10-09.md`. Equivalent chart: `scripts/place/fixtures/fixtures.json` (`PROST380`).

| kind | what | count | where | channels | chart status | file |
|---|---|---|---|---|---|---|
| UP-PL5403 | LED wash 54×3 W RGBW, 15–25° | 40 | road 8 · entrance 2 · lines A–D 12 · L/R 6 · truss 11 · key 1 | 8 (ASSUMED) | CANDIDATE U-Plus IP PAR-54X3 (4/8 ch) | up-pl5403.md |
| UP-B380F | 380 W beam moving head | 18 | plane 1 (6) · side lines (12) | 16 | TESTED map (Sevan units, 10-09, ch 1–10 walked); U-Plus "380 Beam" has a DIFFERENT order | up-b380f.md |
| UP-LA40WF | 40 W RGB laser, DMX/ILDA | 2 | entry, crossing lines | 32 (ASSUMED) | CANDIDATE U-Plus IP-LL40 (manual IP-LL30: 6/19/32 ch) | up-la40wf.md |
| UP-YZ31P | hazer | 1 | the air | 1–2 (ASSUMED) | none found (U-Plus IPH1500 page, no manual) | up-yz31p.md |
| LaserCube Ultra Mk2 | 7.5 W RGB laser cube, network | 6 | back crane girder, the comb | — (not DMX) | manual v1.0 (NOHD), driven live 10-14 | lasercube.md |

Sevan's own DMX lists (the owner, 10-15: "we have all list DMX from Sevan") are NOT in the di.bo inbox; when they arrive they replace every ASSUMED row here.

**Maker (owner's eye, 2026-10-15 16:3x):** UP-PL5403, UP-B380F, UP-LA40WF and UP-YZ31P are U-Plus Lighting (`maker` in fixtures.json and the type library; model and manual per kind). Charts with value ranges: `scripts/place/fixtures/charts/`. The rig's `kit_makers` block lists maker/model/manual per kind. The project's `rentalList` has no maker/model field in its schema (`normalizeRentalList`, src/shared/projectSchema.js + the server twin): the equipment sheet reads the maker from the type library.
