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
  `scripts/place/physics-check.test.js` (runs them in the node suite; CLI refusal exit 2). Ran: python place suite OK (28 after the review round); vitest `../scripts/place ../scripts/rigbuild`
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
- **Review round (2 findings, both real, fixed with tests that failed first: 8 of the 11 new cases failed before):** (1) a lamp ON a slab face (within 1 um) and aimed away got first hit 0
  (`ray_box` accepted t0 = t1 = 0): a false leak, and `--fix` would have written `beam.length` 0 (hidden beam); 13.35 m up, [-20,13.35,0] aimed down gave 0.0, 1 mm lower gave 13.349
  (floor). Now an on-face origin hits only if the ray goes INTO the slab; one aimed away or along the face does not meet it. A lamp deeper inside a slab is still reported (first hit 0,
  `inside_slab: true`) but `fix_ops` skips it: length 0 would hide the beam, the lamp has to be moved. (2) `--tol` 0.5 m is thicker than every slab (deck 0.15, walls and lantern roof 0.30,
  glazing 0.06 / 0.04), so a beam could end outside the building within tol. The allowed overshoot is now `min(--tol, depth through the slab hit)`; a beam ending past the slab's
  far face is a leak. The three issue inputs now read LEAK (deck 12.35 + 0.45, lantern roof 15.4 + 0.45, ribbon glazing 10.52 + 0.45). Live documents unchanged: both projects
  still 4 leaks (79 / 97 beams), no new leak, 0 of 176 lamps on or in a slab. Limit: the floor is a plane with no thickness, so the overshoot below it is still `--tol`.

## 2026-10-20 (update, branch pr1046-update) — dev merged in; two LOW findings fixed; the two other copies of the hand planes moved onto the shell

- **Merge:** `origin/dev` merged into the branch (never rebased). The only conflict was the end of `docs/ai/known-fixes.md` (this PR's physics entry vs dev's show-checkpoint entry): both kept. Dev's laser rules (#1041: `laser-distance.mjs`, `laser_rules.py`, the 40 W chart) and the other place / rigbuild work merged without a textual conflict; no declaration is duplicated.
- **LOW (a), a lamp outside the hall:** `physics_check.py` now reports a lamp whose origin lies outside the hall (the box that holds every slab, floor to the highest top) as a leak row with `outside_hall: true`: counted in `leaks`, exit 1, never fixed (`fix_ops` skips it; `first_hit` and `over_m` are null when its ray meets nothing). Why this and not a second count: the CLI contract has ONE count and one exit code, and the first line's keys stay as they were; a lamp outside is a physics fault of the same kind (the check's premise, a lamp in the room, is false), the row says why. Live, read only: moxir-scenes-v2-0 v526 stays 79 beams, 4 leaks; moxir-v2-11 v928 goes 97 beams, 4 -> **6** (the two floor PARs `rig-par-planes-02` / `-29`, x -39.57, now named). Limit: a box, not the hall's outline; a lamp meant to stand outside needs the owner's word.
- **LOW (b), a lamp at floor level aiming down:** the floor is the first surface at 0 m (`first_surface` -> (0, 'floor')), reported as a leak row with `on_floor: true`, never fixed, never open sky (before: `p[1] > 0` was false at y = 0, so it read 'none (open sky)' and passed).
- **hall-reach.mjs** (epic-build's `beam.length`) now reads `dims.shell` through the same rules (slab method, flush face = no hit, floor at 0 m, refusal without a shell, `epic-build` dies with the message); `HALL_WALLS`, the deck, ridge and lantern width are gone. It is a node port of the same maths; `hall-reach.test.js` holds it equal to `physics_check.py` on 600 deterministic rays of the real v13 shell (distance to 1e-9, same slab). **Measured before -> after** (lamp rest axes, 5 mm): epic rig `moxir-epic-2026-10-08` (epic-build's default) 106 fixtures, 72 first hits moved, 28 were longer than the model allows (7 by more than 1 m, largest 5.45 m: rig-par-press-sides-02 28.06 -> 22.62); v2.11 energy rig 67 fixtures, 52 moved, 17 were longer (rig-laser40-1 86 -> 59.21 m, the 4 deck-gap lamps 15.81 -> 12.66 and 10.82 -> 7.67); none turned to open sky. This is a finding: a stored `beam.length` written by an earlier epic-build run is NOT rewritten by this PR; the next `epic-build` writes the new numbers.
- **laser_frames.py** now takes every ray's first surface from `physics_check.first_surface` over `dims.shell` (the legacy `hand_planes_first_surface` and its four plane constants are deleted); a hall record without a shell is refused (exit 2). Labels the rules speak are derived from the slab names (`rule_label`): `roof deck`, `entry wall` / `back wall`, `east wall` / `west wall`, `lantern glazing (roof | side | kerb)`, `wall glazing (...)`, `open sky`, `floor`; a slab it does not know FAILS ('unclassified shell surface'). New hall rules in `HALL_RULES` (waivable by the officer's switch like the others): `wall glazing`, `open sky`. **Decision for the owner / the laser officer:** the lantern kerb (solid in the model, `validated: false`) is NOT cleared as a stop; rays ending on it fail like the old lantern-glazing rule did (failing closed keeps the check as strict as before; 15 000 rays of the measured set end on it).
- **Measured before -> after, laser_frames** (`--level-cap 1`, the v2.11 energy rig `moxir-v2-11-energy-2026-10-15.json` + `moxir-scenes-50-v2-0-2026-10-17.json` + hall v13; every ray of every lit scene, cube lines and the DMX lines): 99 888 rays; end distance or label or verdict changed on 65 736; verdict ok -> fail 947 (524 'entry wall' -> lantern glazing side, 176 -> kerb, 113 + 82 deck -> side / kerb, 36 + 16 back wall), fail -> ok 5 632 (rays the old planes ended on 'lantern glazing (ridge)' that the model's CLOSED deck gap stops: now `roof deck`); same-label rays moved by a median 0.000 m (max 3.66 m); fail rays 56 514 -> 51 829 over 100 scene-kinds; 18 scene-kinds changed their fail count (e.g. `green-storm` cube 3 112 -> 0; `the-word` cube 0 -> 17; the DMX lines of `green-sparkle`, `green-ash`, `deep-tent`, `afterglow` 0 -> 13 each). **The frames the room plays do not move:** `room_frames` output is byte-identical old vs new for the 36 cube lines and the 2 DMX lines (the surfaces only feed the checks and the plan's rays). Both runs are `ok: false` (as before: that rig and these scenes carry many hall-rule fails on the old planes too). Run time 1.7 s -> 4.7 s for the 99 888 casts.
- **Tests (failed first):** `physics_check_test.py` +10 cases (38 in the place suite: extent, outside, row + exit 1, never fixed, strict JSON, floor at 0 m, floor-aimed row); `hall-reach.test.js` 8 (new file; the moxir-v2 hall test now builds a small shell); `laser-frames-py.test.js` +6 (6 of 6 failed on the old `laser_frames.py`, 12 old ones passed). Ran: python place suite 38 OK; vitest `scripts/place scripts/rigbuild` 104 files 1736 passed (2 expected fail, as before); eslint clean on touched files (6 old warnings elsewhere); `check-agent-docs`, `check:fallback-patterns` clean.
- **Not tested:** no look from outside or from the floor (no scene render); `--fix` not run on any project; no stored rig output regenerated or committed (no `.laser-frames.json` written); no hall but MOXIR's v13.
