## 2026-10-10 — MOXIR v2 ground: every wash and beam that is not on the truss stands on the floor, spread over the owner's whole painted area

Branch `feat/moxir-v2-ground-2026-10-09`, cut from `feat/moxir-v2-spread-2026-10-09` (#864) and stacked on it. A build agent
started it on 10-09 and was cut off by the usage limit; this session continued from its draft, re-checked what it had measured
(its PAR scores reproduce exactly; its island scoring too), and finished it. The look-level fix (#868) is in as a cherry-pick of
its three commits, not a merge of its branch: that branch also carries all of `integrate/moxir-one` (113 files).
Scratch only: tree stack `moxir-ground`, project `moxir-v2-ground` beside the spread's own `moxir-v2-stage-lasers`, seeded from
the spread's stopped scratch stack. Never dev, live or the owner's own di.

The owner, 10-09 21:05 (N465): the washes and beams not used on the truss go on the ground, not on the arcs; the ground washes
are too close; use the places of the area not used yet; epic, use the space right.

- **Rig files.** `scripts/place/rigs/moxir-v2-ground-layer-2026-10-09.json` holds ONLY the 56 floor lamps (38 UP-PL5403 +
  18 UP-B380F, ids kept from the spread). `moxir-v2-ground-2026-10-09.json` is the spread with its non-truss, non-laser,
  non-smoke units replaced by that layer. The cut (10 PARs), the smoke machine and the cubes are untouched (other workflows);
  12 PARs are reserved for the truss (2 held back). Written by `scripts/place/moxir_v2_ground.py` (candidates / build / plan /
  measured / page), guarded by `scripts/place/moxir-v2-ground.test.js` (seen failing on the spread first: 51 violations).
- **Placed from nine audience eyes** (the floor centre, both wings, behind the stage, mid-hall, near the entry, FOH, both far
  corners): a PAR place scores by the light its lit steel sends to each eye, a beam by its glow in the haze, at four depths.
  New PAR places: the same floor places aimed at the crane runway girder or the nearest column's flared head.
- **Spacing: 6 m.** The column pitch, and the knee of the score curve (keeps 94 % at 6 m, 81 % at 7 m).
- **Coverage.** The pick first gives every place of the painted area a lit PAR within one roof height (10.8 m; the
  maximal covering location greedy, Church & ReVelle 1974), then follows the eyes: the largest unlit gap goes from 19.0 m
  (spread) to 10.7 m, at 7 % of the eye score.
- **Beams in four pens**: the stage pen (crew only) and three fenced pens, chosen by score × open sky (occlusion_sky; "clear"
  is ~20 % everywhere under a 10.8 m roof, so the open share decides). 64 m of new barrier, longest low run 4.0 m.
- **The entry lasers (#873)**: nothing in the tower's pen; no beam within 1 m of a laser unit or of the cubes' box; no beam end
  within 3 m of a far-wall block (both margins ASSUMED).
- **Measured** (EV100 2.84, Full, t40, real GPU): floor white-out at the peak 0.37 % with the lasers at 0.4 (budget 0.65 %);
  every other view, both looks, within the same budget after plane 1 went to 0.5 (from behind the stage the stage pen's fan
  whited out 0.92 % at 1.0: measured split, written into the rig). The old spread, drawn now with the fix: 1.05 % from the
  floor (its faders were raised for the bug).

Found: the spread's own patch put 53 devices on one DMX line (its file flagged it); the ground rig's lines are all <= 32.
The level fix makes every MOXIR fader below 1 draw brighter: this rig's looks are set for the linear law.

Owed: the crowd plan (pens, barrier type; Purple Guide not read) and guard cages; the venue's OK for floor plates; the PAR's
candela (scene 30 478 cd vs spec 11 000 cd); the haze on site; the DJ key's level on site with the truss DJ light; the stage
front (booth and PA faces read as silhouettes now: their PARs wait for the truss); a re-check of the beams once the crane,
cut and cubes have their final places; the laser session's look at the beam paths; the owner's look.
