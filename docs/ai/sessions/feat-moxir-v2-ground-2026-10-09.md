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

## 2026-10-10 (afternoon) — the fix after two reviews of #875: B's fan back, beams in the entry half, every rule checked densely

Two reviews refuted the first build (4d76fc1c): EPIC not shown (beams about half as strong at the crowd, 9 of 10 frames darker,
glare budget unused, no beams in the entry half, B's ember fan re-aimed), the stage front dark again, pens sized for one frozen
aim, floor PARs with a standing eye in their beam, the re-aimed fan crossing the smoke machine's refill point, and the 30° rule
checked at 10 eyes only. A first fix run (wf_69d9a387-e39) was cut off after scoring; its builder is committed as found
(0e4c6fc1), then a9d4b0d1 merged (the lasers' cap as drawn light: fader 0.16), then this run's changes. Scratch only (tree stack
`moxir-ground`); never dev, live or the owner's own di. Measured on the branch's viewer with the level fix (0f48b5b9).

Owner's words (N465): *"and also other washes and beams what we dont use make on the ground, not on the arcs, and also washs are
so close on the ground for now you can use the left places of the area so we need epic thing you know use space right"*.

- **Every non-truss unit on the ground.** The truss keeps 10 PARs (the lead); the other 40 PARs and all 18 B380F stand on the
  floor (58 of 58, body <= 1.0 m), none held back.
- **(1) EPIC.** B's fan is the spread's six plane-1 heads, same place and aim (the test compares them exactly). Twelve more beams
  in **four** fenced pens of three (a scratch comparison, a3_islands.py: +20 % beam glow at the crowd over three of four), one
  in the entry half (`entry square x -8 z 33.5`, behind FOH), the others behind the stage (house left), beside the dance floor
  (house left) and in the right wing. The peak runs every hall beam and PAR at full: measured from the floor 0.31 % white-out
  of the 0.65 % budget (the first levels 0.31 %, all at full 0.32 %): the ground's beams stand >= 30° off every eye and glare far
  less per unit than the spread's. The rest of the budget is out of reach with this kit (lasers at their 0.16 cap, the fan
  ember as the owner saw it). **Beam strength from the same nine eyes, same hall (the crane park's air open, the near crane where
  the model has it): x 0.430 of the spread at the crowd eyes with every beam at full (x 0.472 people-weighted over all nine), and
  x 1.078 with each look's own peak levels (x 1.181).** Why below 1 at full: 60 % of the spread's crowd glow comes from nine of its
  beams that each let 1,334-3,180 public points (0.5 m apart) look down them within 30° (a6_spread_rule.py); by the same dense rule the spread
  fails on 77.5 % of the public floor. Frames (same 12 views both layouts, drawn now): at the peak the ground is brighter in 4 of
  5 audience views (wings, behind, entry; the entry 0.064 vs 0.031 mean luminance), darker from the floor centre (0.047 vs
  0.054); the dark look is darker in every view (its beam levels are the spread's design faders; the spread's dark now draws its
  stage keys 1.58x brighter than the owner saw (0.63 drawn now against 0.63² = 0.397 then), left for his re-tune by a9d4b0d1). The DJ's own view is clear (the spread's is a
  grey veil at 0.97 % white-out).
- **(2) The stage front from the ground**, four PARs in the pit: the DJ key and a booth-front lamp in the gap between the PA
  boxes (1.71 / 1.46 m behind the barrier: out of reach, ISO 13857:2019 Table 2 high risk, 1.4 m for a 0.4-0.6 m hazard behind a
  1.0 m barrier, as reproduced in the Troax Safety Guide: EQUIVALENT), and one at each pit end beside its PA box (1.16 / 0.56 m
  behind the barrier: within reach, mesh guard + the pit's security; the PA R lamp aimed into the face so its whole beam ends on
  the box before a leaning eye, found by a grid search, a5_par.py). Lux in the scene (30 478 cd, linear; cut to one decimal, never up): peak DJ face 45.6,
  booth 31.0, PA L 35.5, PA R 35.2; dark 44.4 / 31.5 / 35.0 / 19.1; floors = the spread as the owner saw it on 10-09 (44 / 31 / 35 / 35,
  dark PA R 19). Faders 0.016-0.183: the PL5403's dimmer curve decides on site (owed).
- **(3) Pens for the whole desk window.** Each head carries `desk_limits` (pan +-10° around its aim, tilt from the aim up 15°,
  as fixture degrees from home and 16-bit DMX per dmxDecode.js, EQUIVALENT until the B380F channel walk) and `base` (bolted to a
  600 x 600 x 18 mm ply plate + 2 x 15 kg sandbags or anchors with the venue's OK; statics with a factor 1.5: 163.5 N at the top,
  the head alone 33.7 N; method MOXIR.md 5.2 / ANSI E1.21 practice). Every low run (lower edge from the lens's lowest point, 0.9° +
  2° tolerance, 0.01 m steps) over every pan at the tilt limit stays inside its pen less 0.6 m; heads >= 1.5 m from their barrier
  (ISO 13857 as above). Longest low run 2.58 m. Every window direction (9 pans x 4 tilts) ends on allowed steel (72 scored options
  dropped for ending on a lantern frame between the coarser sample's directions).
- **(4) No standing eye in a floor PAR's beam.** Rule: no public feet point (0.25 m grid) within 0.5 m (a lean over a 1.1 m
  barrier) of the plan points where a PAR's beam (15° + 1° tolerance, from its 0.21 m lens, every ray to its first hit) is
  between 1.5 and 1.9 m. Result: 0 of 40 (the first build: 35 by this rule). PARs stand in the stage pen (4, the pit lamps),
  fenced beam pens (4) or their own fenced PAR pen (32, 2 x 2 m to 4.5 x 2.7 m: **296 m of barrier**), each on the stewards' round
  (MOXIR.md 5.3). Spacing 6 m between the hall's 36 (min 6.0, median 6.0); coverage: median 4.1 m, largest gap 11.4 m (spread
  5.7 / 19.0).
- **(5) The crew.** B's fan sends its low runs into a strip in front of its heads (x -9..-0.4, z -5.4..-2.5, marked: crew keep
  out); 1.77 m from the smoke machine's refill point behind it, 0.64 m from the crew lanes (the back lane, the house-right lane to
  the booth). No PAR on the crew's way. The fan never meets the cut at any near-crane park z 0.15-4.25; at parks z 0.15-3.2 some
  window directions end on the crane's girders (steel), as in the spread at z 0.15.
- **(6) The 30° rule, dense.** 13,333 public points 0.5 m apart, eyes at 1.5 / 1.7 / 1.9 m (+0.6 on the FOH riser), every head
  over its whole window: **0.00 % of the floor fails**, smallest angle 30.2°. The first build: 30.97 % by the test's own rule; the
  spread: 77.5 % (its aims alone).
- **Minors.** Pen radii now from the lens's lowest point with the 2° tolerance and the window; the DJ key 1.71 m behind the
  barrier (was 0.36 m); the truss's 10 PARs on their own circuit (2 000 W, 944 W spare = 4 PARs) and their DMX lines keep 2 spare
  (the fullest line 26 devices, every line <= 28); C-LASER on a phase (L1 7 220 / L2 7 300 / L3 6 700 W); a cable plan
  (plan-cables.png: every circuit and line routed, 1 ramp); the laser table is the merged cap (0.16 = drawn); the glare still
  excludes the 2 x 40 W entry lasers (owed).
- **Tests** (`scripts/place/moxir-v2-ground.test.js`, 17, seen failing 11 on 4d76fc1c with MOXIR_GROUND_RIG / _LAYER, then
  passing): the dense 30° rule, no eye in a PAR's beam, pens for the whole window, the stage front's lux floors, every non-truss
  unit on the ground, B's fan kept, a pen in the entry half; each recomputes the geometry itself. All 30 files under scripts/place
  pass (315 tests).
- **Frames and page:** `~/Downloads/moxir/v2-ground/` (index.html, frames/, frame-luma.json, checks.json, candidates-fix2.json);
  the first build's page and frames kept in `first-build-4d76fc1c/`.

Owed: the crowd plan's acceptance of 4 beam pens (82 m) + 32 PAR pens (296 m) and stewards; the barrier 1 m further out (or the
truss) for the two PA-face lamps; the B380F's manual (clamp points, reset and DMX-loss behaviour) and channel walk (the desk
limits' DMX numbers); its IEC 62471 hazard distance; the PL5403 dimmer curve for the low stage-front faders; the haze on site;
the glare with the 2 x 40 W entry lasers in the scene; the crane's final park (the fan's ends); the owner's look.
