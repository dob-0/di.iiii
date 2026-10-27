# Aren's three pieces as one building, fitted by what the photos show (N1243, 2026-10-23)

Owner: *"look to images … leave the map this time … look dinosaurs you will get"*. The OSM outline is not used (it stays
hidden in the blend). His layout `yard-fix.blend` is not changed (sha256 starts 4dfead08).

## What the pictures say (the topology)

- The building is one panel box with a **lean-to roof**: wall_mid's facade (door, 3 windows, yellow/red/black tape) is the
  **high** long side, eave 3.51 m; main's facade (4 plain windows) is the **low** long side, eave 2.38 m.
- The drawings wall (dinosaur, red figures) is the **end wall**: its top slopes from 3.51 m at the dinosaur end to 2.66 m at
  the red-girl end. So the dinosaur end must meet wall_mid, and the red-girl end must meet main. This also matches his own
  turn of the wall (37 deg in his file; 41.5 deg measured here).
- Walking round the outside, wall_mid's windows end turns the corner into the dinosaur's back. The **black string line**
  runs across that corner, and wall_mid's yellow tape runs into the dinosaur's tail.
- Main's own end wall (above the cardboard KAPU fence, with the courtyard in front) closes the box at the door end.

## Method (written first; scripts in this folder and v/)

1. **Wall lines.** Each facade's plan line is a trimmed least-squares line through the wall points 0.9-2.0 m above the
   foot (`v/_lines.py`). Main's facade and its end wall are 90.1 deg apart.
2. **Corner ends.** I read the corners on face-on outside elevations at 120 px/m (`v/_out_elev.py`, `v/o_*.png`). Each
   corner is the panel edge, eave cap or drainpipe:
   - main facade s -7.62 .. 5.21 m (12.83 m);
   - drawings wall s -4.21 .. 4.33 m (8.54 m);
   - wall_mid s -6.82 .. 7.10 m (13.92 m).
3. **Pose.** Each piece gets a rigid pose: a turn about the vertical plus a shift. No tilt was needed (eaves agree to 0.4 cm).
   - Dinosaur end → wall_mid's windows end.
   - Red-girl end → main's far end.
   - Drawings wall square to main's facade, wall_mid parallel to it.
   - Feet on main's foot line (`v/_visual.py`).
   This is the closed-form solution for the corner constraints. With 3 constraints per piece there is nothing left to minimise.
4. **Check.** I traced the strokes across the seam:
   - The black string line was traced as the darkest row per column with a robust line fit (`v/_string.py`).
   - Paint runs (yellow/red) were sampled in strips at the seam edges.
   - Eave and foot were measured in 0.3 m strips beside each corner.
   - Renders are background Blender, Workbench (`v/_vrender.py`, `v/_c4.py`). I looked at them.

Scales are **kept**: main 2.443, the drawings wall 0.99x, wall_mid 4.09 m/unit. The windows show no reason to change them:
main's and wall_mid's windows measure 2.08 / 2.12 m wide and 1.33 / 1.35 m high.

## Seams, measured

| corner | what meets | eave gap | string / paint | plan |
|---|---|---|---|---|
| C2 dinosaur / wall_mid windows end | the corner he pointed at | **0.4 cm** (3.509 / 3.513 m) | black string at the edge 1.063 / 1.092 m above the foot: **2.9 cm**; yellow tape runs on into the tail | meets by construction |
| C1 red girl / main far end | low end wall / low facade | 27 cm (2.655 / 2.384 m) | no paint on main's facade | meets by construction |
| C3 wall_mid door end / main end wall | the closing corner | wall_mid 3.75 m; main's end wall top 3.3 m (cut by the scan, the tent) | none | **38 cm misclosure**: the door end stands 37 cm past main's end-wall plane |
| C4 main facade / main end wall | inside main's own scan | not fitted | — | main's facade edge stops 0.8 m short of the end-wall plane, behind the whale board |

- **Foot:**
  - Each piece's foot line is on main's (2nd percentile: main 0.327, wall 0.364, wall_mid 0.397 m in the scan, all set to 0).
  - Right at C2 the wall's local foot reads 11 cm higher, under the bushes.
- **C1 eave step 27 cm.** My reading, not proven: the end wall's top carries the roof-panel edge (its thickness plus the cap),
  while main's low facade top is the gutter line under it. The gap is the same kind of thing at C2, where both tops are the
  roof edge, and there they agree to 0.4 cm.
- **C3 misclosure 38 cm** over the chain of 13.92 + 8.54 m (1.7 %).
  - It sits inside wall_mid's measured scale spread (3.96-4.27 m/unit).
  - wall_mid at 3.98 m/unit (-2.7 %) would close it. I did NOT apply that, because the drawings don't prove it: the
    window sizes agree with 4.09 to within 2 %.
  - Other possible causes, open: main's end-wall plane is read above the KAPU fence and through the tent (0.7 deg off
    square), or the door end has a real step.
- Main's whale-board pillar and the drawings wall's pale return flap at C1 are scan scraps. They cover about 1 m of
  main's first window bay in the C1 view.

## Files

- `yard-fix-visual.blend`:
  - metres, main's frame (x along main's facade, foot at z 0); not on the map.
  - Each piece carries its pose in the custom property `fit_N1243`.
  - The footprint object is hidden.
- `visual.json`: per piece `s`, `R`, `q_xyzw`, `t` in the yard scan frame (y up). Same convention as fit.json (N1241),
  for yard.html IN_YARD; wall has its old IN_YARD folded in. It also holds the corners and checks.
  - main: identity.
  - wall: s 0.99.
  - wall_mid: s 1.67417.
  - **Owed:** IN_YARD in yard.html has no `s` field yet.
- Renders, one per file plus the sheet:
  - `visual-seam-C2-closeup.png`
  - `visual-corner-C1…C4-*.png`
  - `visual-end-dino-wall.png`
  - `visual-side-main-facade.png`, `visual-side-wallmid-facade.png`
  - `visual-top.png`
  - `visual-sheet.png` (all of them).
- Rerun, from `v/`:
  ```
  blender --background ../yard-fix-scaled.blend --python _visual.py -- $PWD
  blender --background ../yard-fix-visual.blend --python _vrender.py -- $PWD
  ```
  - Inputs: `lines.json` from `_dumpv.py` + `_lines.py`.
  - Corner s-values are set in `_visual.py` (`E=`).
  - **Owed:** move these into di.iiii `spaces/dilijan/aren/` (rule "nothing left behind").
