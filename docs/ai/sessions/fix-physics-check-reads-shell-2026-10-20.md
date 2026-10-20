## 2026-10-20 — physics_check.py reads dims.shell (one source); the hand-copied planes are gone from it

- **What:** `scripts/place/physics_check.py` now casts every beam against the hall record's `dims.shell` (65 slab boxes from
  `hall_shell.py`, PR #1044) with the slab method, from inside or outside a slab; the floor `y = 0` is the one plane kept (the shell has no
  floor). A hall record with no `dims.shell` is refused: stderr names `hall_shell.py --write`, exit 2, nothing checked. Output format,
  `--tol`, `--fix` (`fix_ops`) and exit codes are unchanged; `main(argv)` takes an argument list so tests call it. Why: owner rule
  "Physics first" 2, a stored number that only fits an old state is a bug; the file had `WEST_X, EAST_X, WALL_Z, BACK_Z`, the deck and ridge copied by hand.
- **Truth used:** the owner's final reference rig = project moxir-scenes-v2-0 v526 (`hall-compare.mjs --ref scripts/place/rigs/moxir-hall-reference-2026-10-17.json`:
  EQUAL, 44 DMX lamps, 3D and desk) and the v2.11 project moxir-v2-11 v928. Hall record v13 skin (the GLB the room draws); the v11 record
  carries the identical shell (checked: equal lists).
- **Measured before -> after** (same documents, same hall record, `--tol 0.5`; drawn beams = spot lights with a beam or light length;
  full per-lamp table in `~/di-health/merge-proof/phys-shell.txt`):

  | project | beams | leaks before | leaks after | lamps with first-hit change (> 5 mm or verdict) |
  |---|---|---|---|---|
  | moxir-scenes-v2-0 v526 (reference rig) | 79 | 0 | **4** | 33 |
  | moxir-v2-11 v928 | 97 | 0 | **4** | 50 |

  Why the first-hit distances changed (each row of the table carries its reason): deck underside 13.35 in the model vs 13.3 copied: +0.05 m / dy
  on 24 (reference) / 37 (v2.11) lamps, 61 rows all matching that prediction to 1.5 mm (largest +0.435 m, laser 41, oblique); the second
  lantern (span 1, x 18..30) the copied planes did not have: 4 beams now rise past the deck opening to the roof underside 15.7; lantern roof
  underside 16.4 vs ridge 16.5: 1 / 3 lamps; 2 lamps in v2.11 stand OUTSIDE the walls (floor PARs, x -39.57) and the copied planes had
  stopped them on a deck they never reach, now open sky; and **the four leaks**.
- **The four leaks are a real finding, not tuned away:** `rig-beam-planes-03`, `-04` (x ±2.07, z -5.21, drawn 15.81 m, deck at 12.65 m), `rig-par-cut-09`
  (drawn 10.82, deck 7.66) and `rig-laser-42` (85.9 m, deck 59.11 m) stand in the 12 m gap |z| < 6 between the lantern segments of span 0 where the model has a
  CLOSED deck at 13.35; the copied planes had the lantern the whole length and let them through to the ridge. Their stored `beam.length` runs through the deck. On
  screen the room clips at run time (`beamReach.js`), so nothing was seen; the document is wrong. NOT changed here (`--fix` would write 4 lengths into the owner's
  projects: his call, a ledger row). They sit in both projects.
- **Tests:** `scripts/place/physics_check_test.py` 17 cases (3 old fix_ops + slab stop on a fixture room; beam through the 4 x 4 m deck opening stops on the
  lantern roof; beam beside it stops on the deck; floor; beam from outside meets the wall it stands behind; origin inside a slab = 0 m; refusal without shell and a
  malformed slab; `main()` output format and the leak row; the real hall: gap deck 12.35, lantern roof 15.4, span-1 lantern, east wall 60.4, ribbon glazing 60.52, back
  wall 53.8, the far gate = open sky; the reference rig's 44 lamps drawn to their first surfaces = 0 leaks, and +1 m each = all leak, on both hall records) and
  `scripts/place/physics-check.test.js` (runs them in the node suite; CLI refusal exit 2). Ran: python place suite OK; vitest `../scripts/place ../scripts/rigbuild`
  103 files 1720 passed (2 expected fail, as before); `hall-shell`, `laser-margin`, `laser-frames-py`, `scenes-tools` pass unchanged.
- **Limits:** rest axis only; slab boxes, not triangles (no space frame lattice, columns, cranes); glazing ends a beam although light would transmit; a beam through a
  shell opening (the far gate, the entry gate) ends in open sky and is never a leak (an outside-exposure check is separate); a lamp outside the hall is not reported
  (2 in v2.11). `validated: false` is inherited from the shell (a parametric model, not a survey; heights unmeasured, hold point H5).
- **Left behind, now rows (two copies of the same bug):** (1) `scripts/rigbuild/hall-reach.mjs` (`HALL_WALLS`, deck, ridge) — epic-build writes `beam.length` from it: the
  source of the four stored lengths; comment now says so. (2) `scripts/place/laser_frames.py` called `physics_check.first_surface(p, d, dims)`; it now holds the old planes
  as `hand_planes_first_surface`, labelled legacy, so its output and committed designs do not move under this change (its labels 'entry wall', 'floor' and its dims-only test
  hall lean on them). Both move to `dims.shell` in their own PR with their own before/after.
- **Cost / method:** 1 worktree `../di.iiii-phys`; ~45 tool rounds; two vitest runs of ~140 s each behind `di-cool`. Method: ray against axis-aligned boxes, slab method (Kay &
  Kajiya 1986; Williams et al. 2005 for the zero-direction case).
