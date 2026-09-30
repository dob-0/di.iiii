# MOXIR sign-off pack — rigging, laser safety, electrics

**This document is an information pack, NOT a design or a compliance statement.** It claims nothing is safe,
compliant, rated or approved. It puts, on one page per signer, the numbers the repo holds for the two MOXIR
"movers on the ground" versions (`minimal-ground`, `full-ground`), says how each number is known, says what is
NOT known, and asks the questions that only a human with a signature can answer.

- Date of the pack: 2026-09-30. Built from the branch `fix/ground-real-lights` as pushed (hall, rigs, scenes, policy).
- Nothing here was seen in the hall, on a screen or on the owner's install. Every number is read from a file in
  this repo, or is arithmetic on such numbers (stated next to it). No browser was used.
- Tables as CSV, same folder: `docs/architecture/moxir-signoff/loads.csv`, `lasers.csv`, `power.csv`.

## 0. How to read this pack

Each figure carries the basis the repo itself records for it:

| flag | meaning here |
|---|---|
| EXACT | the type table's own label (`src/rigbuild/types/moxir.json`, `basis`): the figure is from the maker's or rental list's own page for this model. It is NOT a measurement of the unit that will arrive. |
| EQUIVALENT | a published figure for a different maker's product, used as a stand-in. The rented unit may differ. |
| ASSUMED | chosen by the rig's author with no source (DMX modes, some heights). |
| ESTIMATE | derived or planned by the rig code or its author; the file says so. |
| GUESS / UNKNOWN | the hall model or the repo says "GUESS", or the repo holds nothing. |

Units: metres in the hall frame (x across the nave, centre 0; z along it, the DJ at about 5.2, the entry door at
54.5; y up from the floor). Force: kN = kg x 9.80665 / 1000 (standard gravity), static, **no dynamic factor and no
safety factor applied** — those are the signer's to choose. Standards named below are named only because the repo
itself names them; **the signer names the applicable standard**, and whether any is the one required in Armenia is
UNVERIFIED throughout.

### One page — the headline numbers (both ground versions unless stated)

| signer | headline (ESTIMATE unless flagged) | what is not known |
|---|---|---|
| Rigging / structural | 3 hoist points on the bridge of the old crane parked over the DJ. Truss line 279.9 kg (2.745 kN); on the bridge, with hoists, chains and hardware, 379.0 kg (3.717 kN). Per point on the bridge 98.1 / 167.4 / 113.5 kg (0.962 / 1.642 / 1.113 kN). | crane rated load, inspection, lock-out; hoists; chain grade; supplier's truss; safety steels; floor loading on the ground positions |
| Laser safety officer | 2 x UP-LA40WF, Class 4, 40 W stated. Lenses at y 4.635 m and 6.926 m, z about 5.1, fixed on the truss top chord; every aim rises (18.7 to 29.8 degrees); lowest drawn beam over the crowd floor 5.09 m (rule: 3 m or more). | the real unit's optical output, aperture, divergence, scan angle, safeguards; what the beams strike |
| Electrician | 18,942 W (Minimal-ground) / 31,662 W (Full-ground): 82 A / 138 A at 230 V with power factor 1; at least 7 / 11 circuits of the sheet's 2,944 W; 658 / 696 DMX channels, at least 2 universes. | the venue's mains supply, earthing, distribution, cable plan |

## 1. The two versions in one paragraph

Both hang ONE straight 12 m box truss (4 x 3 m, planned on the Prolyte H30V) in the vertical plane of the crane
bridge, sloped 15 degrees: bottom chord 3.44 m at house left (x -6.04) to 6.55 m at house right (x +5.55), trim
5.06 m over the DJ's axis (rig file `truss`: `ends`, `trim_m`, `rise_m`). On it: 7 UP-COB200, 10 UP-PL5403 and the
2 lasers — statics only. Every moving head is on the floor: 7 UP-B380F behind the press, 6 UP-B380F, 6 UP-250BSW
and 4 UP-HK1915 at the nave column bases, 8 + 3 PARs on the floor. `full-ground` adds hazers, CO2, cold spark and
smoke machines, all on the floor. Sources: `docs/architecture/RIG_BUILD.md` §15.8 (line 1247) and §15.12 (line
1515); rig files `scripts/place/rigs/moxir-2026-10-17-minimal-ground.json` and `...-full-ground.json`; policy
`policy.movingFixtures` in both; guard `scripts/rigbuild/ground-movers.test.js`.

---

## 2. Signer 1 — the rigging / structural engineer

### 2.1 The load path as drawn

Bridge of the entry-end crane, rolled along its runway to park over the DJ (bridge centre line z 4.8) — two box
girders (0.7 m wide, at z 4.8 +/-1.1, inner faces 1.5 m apart) — a girder clamp on the INNER edge of each girder's
bottom flange — a two-leg steel bridle (a "V", from both girders) — apex — a chain hoist under the apex (planned:
500 kg class, CHAINMASTER D8 Plus SK030/76U; the rental house's hoists are owed) — a round sling in basket hitch
over both top chords — the truss. Per pick a secondary safety steel from the top chords to its OWN clamp on the back
girder, independent of bridle and hoist. Two opposed tie-offs (house-left end to the nave column at x -11.6, z 6.0,
at 3.59 m; house-right end to the column at x +11.6, z 6.0, at 5.5 m; a 2 t ratchet strap or a 6 mm steel with a
turnbuckle, hand-tight about 50 daN, ESTIMATE) hold the line along x. Source: rig file `truss.rigging` (`bridle`,
`safety`, `tieoffs`, `hoist`, `drop`); `RIG_BUILD.md` §15.8.

### 2.2 Loads per hoist point (both ground versions are identical)

Rig file `truss.rigging.picks` and `truss.rigging.load`; kN computed here. **All of it is ESTIMATE**: static, three
supports on a continuous line (flexibility method in `versions.mjs threePointReactions`), before any dynamic factor.

| point | u along line (m) | x (m) | bottom chord (m) | bridle apex (m) | bridle included angle | on the line | on the bridge (line + hoist + chain + hardware) | heaviest bridle leg |
|---|---|---|---|---|---|---|---|---|
| house left (low end) | -5.75 | -5.59 | 3.57 | 4.71 | 26 deg | 65.1 kg / 0.638 kN | 98.1 kg / 0.962 kN | 47.3 kg / 0.464 kN |
| middle | -0.5 | -0.52 | 4.93 | 6.07 | 42 deg | 134.3 kg / 1.317 kN | 167.4 kg / 1.642 kN | 86.6 kg / 0.849 kN |
| house right (high end) | 5.25 | 5.03 | 6.42 | 7.56 | 119 deg | 80.5 kg / 0.789 kN | 113.5 kg / 1.113 kN | 106.1 kg / 1.040 kN |
| **sum** | | | | | | **279.9 kg / 2.745 kN** | **379.0 kg / 3.717 kN** | |

What the line load is made of (rig file `truss.rigging.load`, masses from `src/rigbuild/types/moxir.json`):

| item | n | each | kg | kN | basis |
|---|---|---|---|---|---|
| UP-COB200 | 7 | 5.1 kg | 35.7 | 0.350 | EXACT (maker's own store listing, read 2026-09-29) |
| UP-PL5403, the X (`par-cut-x`) | 6 | 8 kg | 48.0 | 0.471 | EXACT-labelled; the two listings disagree (5.9 kg vs 8 kg), the higher is used: "the rental unit decides" |
| UP-PL5403, on the bridge (`par-cut-bridge`) | 4 | 8 kg | 32.0 | 0.314 | same |
| UP-LA40WF (`laser-cut`) | 2 | 35 kg | 70.0 | 0.686 | EQUIVALENT (Blue Sea BLLO-RGB40, a different maker's 40 W laser) |
| lamps subtotal | | | 185.7 | 1.821 | |
| truss 4 x H30V-L300 | 12 m | 6.3 kg/m | 75.6 | 0.741 | ESTIMATE: Prolyte's published 18.9 kg per 3 m for a NAMED product, read 2026-09-29; the supplier's truss is UNKNOWN |
| clamps, bonds, cable loom | | +10 % of lamps | 18.6 | 0.182 | ESTIMATE |
| **line total** | | | **279.9** (file: 280) | **2.745** | ESTIMATE |

Added at each pick on the bridge: hoist 20 kg (CHAINMASTER data sheet rev 1.1, EQUIVALENT to the rental hoist),
chain 0.59 kg/m x 12 m carried = 7.08 kg (the 12 m is ESTIMATE), bridle hardware 6 kg (ESTIMATE): 33.08 kg
(0.324 kN) a point. Natural periods of the hang: 1.85 s across the bridge and 2.28 to 4.08 s along the line, by pick (rig file `picks`, `truss.motion.periods_s`); the
show files forbid a full-range pan/tilt faster than 4 s on the line (`truss.motion`), moot here because no mover
hangs from it. Lowest point of the truss 3.44 m: 0.94 m over raised hands (2.5 m, the owner's number); it hangs in
the bridge's plane behind the crowd barrier (`truss.clearance`).

Earlier and other versions, for the record (rig files' `truss.rigging.load`; all ESTIMATE; **the "about 278-286 kg
on 2 points" note is the old flat 8 m line of §15.7 and is superseded by the cut for Minimal**; Middle and Full
below still carry the 8 m, 2-hoist line):

| version | hoists | lamps kg | truss kg | extras kg | total kg | per point kg |
|---|---|---|---|---|---|---|
| full-ground | 3 | 185.7 | 75.6 | 18.6 | 280 | 65 / 134 / 80 |
| minimal-ground | 3 | 185.7 | 75.6 | 18.6 | 280 | 65 / 134 / 80 |
| minimal (the cut) | 3 | 115.7 | 75.6 | 11.6 | 203 | 39 / 114 / 50 |
| minimal-cut-movers | 3 | 208.6 | 75.6 | 20.9 | 305 | 52 / 183 / 70 |
| middle | 2 | 292.6 | 48-56 | 29 | 370-378 | 185 / 189 |
| full | 2 | 327.6 | 48-56 | 33 | 409-417 | 205 / 209 |
| minimal-halo | 3 | 172.4 | 74.4 | 17 | 264 | apex 92, left 86, right 86 |
| minimal-halo-heads | 3 | 208.6 | 74.4 | 21 | 304 | apex 113, left 95, right 95 |
| minimal-xflat | 4 | 148.4 | 63.1 | 15 | 227 | 57 / 57 |
| minimal-xflat-heads | 4 | 208.6 | 63.1 | 21 | 293 | 73 / 73 |

### 2.3 The crane and the hall — the numbers and how sure the repo is

| item | figure | basis and confidence | source |
|---|---|---|---|
| crane rail height | 8.1 m (7.8-8.4) | medium-high: photo metrology of the FAR crane (Criminisi et al. 2000 method) | `scripts/place/rigs/moxir-hall-dims-2026-09-29.json` `crane_rail_h_m` |
| same, as the rigs were built | 7.6 m (disputed 6.6-8.4) | low-medium ("disputed") | `truss.rigging.crane` text; `moxir-hall-dims-2026-09-28.json` `confidence` |
| bridge girder underside | 7.95 m (7.7-8.25) measured on the FAR crane | medium; the entry-end crane over the DJ is ASSUMED the same type, its own underside NOT measured | `moxir-hall-dims-2026-09-29.json` `crane_bridge_bottom_h_m` and `notes` |
| same, as the rigs were built | 8.15 m | ESTIMATED (the rig file says so) | `moxir-hall-2026-09-28-crane-dj.hall.json` `geometry.cranes[0]`; `moxir-ground-movers-2026-09-30.json` `hallCheck` (built hall 7.95, committed hall 8.15) |
| girder depth | 0.8 m (0.7-0.9) measured; the built rigs use girder top 9.65 m, i.e. 1.5 m deep | medium; the older 1.5 m was labelled GUESS | dims 09-29 `crane_bridge_depth_m`; dims 09-28 `crane_girder_depth_m` = GUESS |
| girder width, gap | 0.7 m, gap 1.5 m (girders at +/-1.1 m) | confidence not recorded | hall `geometry.cranes[0]` |
| operator's cab | x -10.35 to -8.35, z 3.8 to 5.8, y 5.95 to 8.15 | medium (2.1 m under the girders) | hall `geometry.cranes[0].cab`; dims 09-29 `crane_cab_h_m` |
| trolley | x 7.6 to 10.2, y 9.65 to 10.65 (parked at the right end) | not recorded | hall `geometry.cranes[0].trolley` |
| roof (space frame) underside | 11.0 m | medium (dims 09-28 `truss_bottom_h_m`); a 09-29 cross-check reads 11.26 m, "low (not a clean edge)" | RIG_BUILD §15.12; dims 09-29 `truss_bottom_h_m_check` |
| nave columns: inner face | x +/-11.6 m; grid z at 6 m pitch | pitch medium-high; **column width and depth are GUESS** | hall `geometry.column_inner_face_x_m`; dims 09-28 `column_w_m`, `column_d_m` |
| DJ riser | 3 x 2 m, 1.2 m high, on the nave centre line | "estimates, not a survey" | RIG_BUILD §15.7; rig file `stage` |
| runway beam under which the high tie-off passes | 6.56-7.46 m on the column line (text only) | ESTIMATE | rig file `truss.rigging.tieoffs[1].what` |

**Two things in the repo do not agree, and the signer must be given ONE measured value:** the rigs were built on a
girder underside of 8.15 m; the photograph measurement (far crane) is 7.95 m. The 0.2 m is not propagated through the
heights above. The rig file's own remaining item: "a tape or laser distance to the crane's underside on site (one
number settles it), and the entry-end crane's own underside and hook height" (dims 09-29 `notes`).

### 2.4 Ground positions and what stands there (for the floor)

From the built rig (rest aims, committed hall); masses from the type table. Floor loading and floor condition at
these positions are NOT in the repo.

| group | n | model | each | position (x, z) | lens/mount height | mass basis |
|---|---|---|---|---|---|---|
| beam380-backstage | 7 | UP-B380F | 23 kg | x -4.52 to 4.52, z -1.5 | 0.70 m | EXACT |
| beam380-columns-6 | 6 | UP-B380F | 23 kg | x +/-10.88, z 12, 24, 36 | 0.70 m | EXACT |
| bsw250-ground | 6 | UP-250BSW | 13.5 kg | x +/-10.6, z 18, 30, 42 | 0.54 m | EXACT |
| beeeye-ground | 4 | UP-HK1915 | 15 kg | x +/-10.61, z -6 and 48 | 0.49 m | EQUIVALENT (makers' listings contradict: 12.5 / 6.2 / 10.5 kg) |
| par-columns-8 | 8 | UP-PL5403 | 8 kg | x +/-11.16, z 6 to 42 | 0.31 m | EXACT (the D-CN listing says 5.9 kg) |
| par-press-cut | 3 | UP-PL5403 | 8 kg | x 0.5 to 2.5, z 3.53 | 0.31 m | EXACT |
| hazers (2 booth-back; 4 more along the columns in Full) | 2 / 6 | EXT-HAZER | 74.6 kg | booth-back at dx +/-4.5; nave columns | floor | EQUIVALENT (Antari HZ-1000) |
| smoke (Full) | 4 | UP-YZ31P | 13.3 kg | by the nave columns | floor | EQUIVALENT (Antari Z-1500 III) |
| cold spark (Full) | 4 | UP-YH600F | 8.5 kg | pit between riser and barrier | floor | EQUIVALENT (Showven Sparkular) |
| CO2 jets (Full) | 6 | UP-Q108S | 4.2 kg | same pit | floor | EQUIVALENT (MagicFX CO2 Jet II); **cylinders' mass not in the repo** |

The hall model puts the machinery (press, machine line, pipe) at x 0.25-13, z -0.5 to 3.2 and the 3 m low walls at
x about 11.6 (left row z 12.5-42.5; the right row is a GUESS); neither is used for a mover. The 14 candidate
floors the analysis walked through and why each was taken or left: `RIG_BUILD.md` §15.12 and
`scripts/place/rigs/moxir-ground-movers-2026-09-30.json` `places`. Its word "safe" is a geometric claim about beam
cones against the dance zone (x +/-5.35, z 7.5-48, below 2.5 m), not a statement about floors or people.

### 2.5 UNKNOWN — to be measured or supplied by the signer

1. The old crane: rated load, rating plate, last inspection (date, by whom), the state of the runway, rails, end
   trucks, brakes; whether the entry-end crane is the same type as the far crane; its span (the repo's only figure
   is a derivation from a GOST rail-span formula on the far crane).
2. Lock-out: how the crane is held in place and its power isolated for the whole event (the rig file requires it
   in words, `truss.rigging.signoff`; nothing exists in the repo to do it).
3. Girder underside and hook height of the entry-end crane on site (one tape measure; see 2.3).
4. Girder flanges at the clamp points: thickness, condition, paint, corrosion; the clamps' type and rating.
5. Hoist: the rental house's hoists (make, model, working load limit, chain grade, test certificates); the repo
   plans on a named CHAINMASTER 500 kg unit.
6. Truss: the supplier's make, model, load table, certificates; the repo plans on the Prolyte H30V (18.9 kg per
   3 m, span table 6 m / 321.6 kg/m as quoted in the rig file).
7. Safety steels and bridle steels: rating, length, termination.
8. The nave columns as tie-off points at x +/-11.6, z 6.0: size, material, condition (GUESS in the hall model).
9. Floor loading and condition at every ground position of 2.4 (the floor of a factory: slabs, pits, ducts,
   trenches, drains).
10. Dynamic factors, safety factors and load cases (the repo has none); the effect of the middle pick's share
    moving with chain lengths ("a 3-point line is statically indeterminate", `load.note`).

### 2.6 Questions to put to the rigging / structural engineer

1. Can the parked crane's bridge carry a hung line of 379 kg (3.7 kN) on three points on the inner bottom flanges of
   its two girders? If the crane's rated load is unknown, are you willing to assess the girders, end trucks and
   runway as a structure, and what factors do you apply?
2. What must be done to lock the crane and isolate its power, who holds the key, and for which days?
3. The high pick's two-leg bridle sits at 119 degrees included, close to the 120 degree limit the rig file cites
   (H. Donovan, Entertainment Rigging, 2002). Do you accept that, or should the high end be lower?
4. Do you accept girder clamps at the inner flange edges with a bridle from both girders, and what clamp?
5. Which hoists and chain grade do you want, and do you want two hoists per point or a secondary system? The
   drawing has one safety steel per point to its own clamp on the back girder.
6. The truss: which make and load table will you accept, and is the 6.3 kg/m estimate close enough to start?
7. With a 3-point line, how do you want it trimmed and monitored? The rig file suggests load cells at trim.
8. Will the nave columns take the two tie-offs (about 50 daN, estimated)? Column size and material are guesses.
9. Is 3.44 m at the lowest point of the line over people who may be in that area acceptable?
10. Can the floor take the ground positions in 2.4, including 74.6 kg hazers? Which spots need a survey first?
11. Who rigs, how do they reach the girders, and what work-at-height method do you require?

### 2.7 Sign-off block — rigging / structural

| | |
|---|---|
| Name | |
| Organisation, qualification, registration number | |
| Date | |
| Scope signed for (tick): crane / bridge / runway; hoists and chains; truss; tie-offs and safety steels; ground floors; other: | |
| Decision (one): approve as drawn / approve with conditions / not approved / more data needed | |
| Conditions | |
| Own calculations and certificates attached (list) | |

**This document is an information pack, NOT a design or a compliance statement.** A signature below records the
signer's own assessment, which the signer attaches; nothing in this pack is that assessment.

---

## 3. Signer 2 — the laser safety officer

### 3.1 The device (type table `src/rigbuild/types/moxir.json`, `UP-LA40WF`; rig file `classes.laser`)

| item | figure | basis |
|---|---|---|
| model | UP-LA40WF, "40 W (stated) RGB show laser, class 4" | rig file `classes.laser.class`; **Class 4 by any reading of the rental list; not measured** |
| count | 2 (rental stock 2 of 2) | RIG_BUILD §15.12 |
| whether 40 W is optical or electrical | UNKNOWN | the repo does not say |
| mass / size | 35 kg; 420 x 555 x 235 mm | EQUIVALENT (Blue Sea BLLO-RGB40, "waterproof 40 W RGB animation laser light", IP65) |
| electrical power | 1,200 W | EQUIVALENT (same product) |
| control | 11 DMX channels | ASSUMED mode ("11ch-assumed") |
| mount | FIXED on the truss top chord (`mount: truss-top`); nothing pans or tilts; the scanner is two mirrors inside | rig file `laser-cut`; RIG_BUILD §15.12 reads the device as "not a moving head" and flags that reading for the owner |
| drawn beam | 1.2 degrees full cone (half angle 0.6 degrees), reach 60 m, green | **a drawing device**: "a real laser beam is millimetres wide and scanned into shapes, which is not represented"; the 60 m is a drawing reach, not a hazard distance |

Classification standard the repo names: IEC 60825-1 ("the Maximum Permissible Exposure limits of IEC 60825-1",
rig file `assumptions[4]`). UNVERIFIED that it is the one required in Armenia; the signer names the applicable
standard and the national rule (RIG_BUILD §15.12 says both were NOT read).

### 3.2 Positions, heights, aims (built rig, the committed 09-28 hall, every look)

Computed by running the repo's own builder and helpers (`buildAllLooks`, `spotAimDirection`, `lowestInZone` from
`scripts/rigbuild/ground-movers.mjs`) on both versions: 15 aim sets (rest aims + 14 looks) for Minimal-ground, 17 for
Full-ground; every row is in `docs/architecture/moxir-signoff/lasers.csv`. Positions are identical in both versions.

| laser | x (m) | lens y (m) | z (m) | aim elevation over the looks | aim azimuth (from +x toward +z) | lens over the riser deck (1.2 m) |
|---|---|---|---|---|---|---|
| 01 (house left) | -4.323 | 4.635 | 5.108 | +24.58 to +29.78 deg | 78.7 to 81.0 deg (toward the house, drifting toward the centre line) | 3.435 m |
| 02 (house right) | +4.247 | 6.926 | 5.120 | +18.73 to +22.98 deg | 98.8 to 101.1 deg | 5.726 m |

The two heights differ because the line is sloped 15 degrees and the lasers stand at u = -4.5 and +4.5 on its top
chord (`laser-cut`, `dx_m [4.5]`); **both heights move with the trim** the rigger sets. Nothing in these numbers holds
if a hoist fails: the aims are fixed to a truss that would tilt.

### 3.3 The rule, and the clearance it gives

The rule (rig file `policy.movingFixtures.lasers` and `.rule`): both lasers are fixed; every beam stays 3 m or more
over any floor a person can stand on; the aim rule is `laser-into-roof` (every beam rising into the roof over the
house). Kept by the rig code (a laser under 3 m or aimed down is refused) and by `ground-movers.test.js` ("the two
lasers"): lens 3 m or more, direction rising, cone never under 3 m over the person-floor plan (x +/-11.6, z from the
stage front 6.2 to the door 54.5).

| laser | lowest drawn beam over that plan (min over looks) | margin over the 3 m rule | margin over raised hands (2.5 m) | where the beam axis meets the roof underside (11.0 m) | range from the lens |
|---|---|---|---|---|---|
| 01 | 5.09 m | 2.09 m | 2.59 m | x -2.15, z 16.02 to 18.92 | 12.8 to 15.4 m |
| 02 | 7.28 m | 4.28 m | 4.78 m | x +2.40, z 14.55 to 17.07 | 10.4 to 12.8 m |

Method: axis plus 8 edge rays of the drawn cone, stepped 0.1 m to 60 m, lowest height inside the plan rectangle;
the roof point is the axis meeting the plane y = 11.0 m. **These are geometry of a drawn cone at a committed model,
not a laser hazard assessment**: the scanned fan (the pattern envelope) is not modelled, the divergence is a
placeholder, the trim is nominal, the hall model is a model.

### 3.4 What the model does NOT cover (people who could be in a beam's neighbourhood)

The "person-floor plan" is the nave floor between the stage front and the door. Not in it: the DJ riser deck
(z 4.2-6.2, the lasers stand over it, x offsets -4.3 and +4.2), the crane cab (x -10.35 to -8.35, z 3.8-5.8, y
5.95-8.15), any walkway on the crane girders (tops at 9.65 m), the low-wall tops (3 m), the roof and lantern access,
windows and openings. Whether anyone can be in those places during a show is UNKNOWN to the repo.

### 3.5 UNKNOWN — to be measured or supplied by the signer

1. The real unit's datasheet: optical output per colour, beam diameter at the aperture, divergence, scan angle and
   speed, pattern envelope, wavelengths, class label, interlock and emergency-stop connections, key control, shutter,
   scan-failure safeguards. (The repo holds a stand-in.)
2. Which units the rental house delivers (serial numbers, test reports).
3. What the beams strike: the space frame's members and deck, paint, reflectivity, lantern or windows in line.
4. Whether 3 m over "any floor a person can stand on" is the height the signer wants, and what exclusion volume,
   beam stops or hardware limits are required.
5. The laser cues: there is NO cue list for the two ground versions (session note `feat-moxir-ground-movers.md`);
   the looks' aims are drawing states, not a show.
6. Operating arrangements: operator, position of the emergency stop, communications, signage.
7. The mount: how a 35 kg (EQUIVALENT) unit is fixed to the truss top chord and how its aim is fixed.

### 3.6 Questions to put to the laser safety officer

1. Which standard and national rule apply to a Class 4 show laser used in this hall? (The repo only names
   IEC 60825-1 for classification, unverified for Armenia.) What notification or approval is needed?
2. Is a fixed scanning laser aimed up into the roof, 3 m or more over every floor, acceptable to you, or do you need
   a different height, an exclusion volume, or hardware limits on the scan?
3. What must the rental house give you about the real unit before you can judge?
4. If a hoist fails and the truss tilts, the aims tilt with it, by tens of degrees at the low end. Do you require a
   hardware stop or an interlock for that, and how do you want it tested?
5. The beams end in the roof structure, 10 to 15 m from the lens. What must be known about what they strike, and do
   you want beam stops?
6. People above the beam paths (crane cab, girders, lantern): must these be locked out, and how?
7. Six hazers (Full) or two (Minimal) fill the hall with haze, which makes beams visible and scatters them. Does
   that change your assessment?
8. Who operates the lasers, where is the stop, and what does the operator need on the desk (scan-zone limits)?
9. How do you want the beams checked in the hall before doors open, and by whom?

### 3.7 Sign-off block — laser safety

| | |
|---|---|
| Name | |
| Organisation, qualification, certificate number | |
| Date | |
| Scope signed for (tick): positions; heights and aims; show content; operating arrangements; other: | |
| Standard(s) applied (the signer names them) | |
| Decision (one): approve as drawn / approve with conditions / not approved / more data needed | |
| Conditions | |
| Own assessment and measurements attached (list) | |

**This document is an information pack, NOT a design or a compliance statement.** It does not claim that any laser
position, height, aim or show is safe or permitted.

---

## 4. Signer 3 — the electrician

### 4.1 Power, per version and per group

Power per fixture is the type table's datasheet MAXIMUM (`power_w`); the sheet takes power factor 1, which
understates current for switch-mode and discharge loads (`RIG_BUILD.md` §2.5, line 174). Amps = watts / 230, single-
phase equivalent. The planning limit per circuit is 16 A x 230 V x 0.8 = **2,944 W** (`src/rigbuild/sheet.js`
`circuitLimitW`, line 19; RIG_BUILD §2.5): an assumption of the sheet ("a single-phase 16 A circuit, the IEC 60309
blue connector common on European stages"), **not a fact about the venue**. Full table: `power.csv`.

| version | row | model | n | each W (basis) | total W | total A | of one 2,944 W circuit |
|---|---|---|---|---|---|---|---|
| both | cob-cut-curtain | UP-COB200 | 7 | 180 (EXACT) | 1,260 | 5.5 | 43 % |
| both | par-cut-x | UP-PL5403 | 6 | 162 (EXACT) | 972 | 4.2 | 33 % |
| both | par-cut-bridge | UP-PL5403 | 4 | 162 (EXACT) | 648 | 2.8 | 22 % |
| both | par-columns-8 | UP-PL5403 | 8 | 162 (EXACT) | 1,296 | 5.6 | 44 % |
| both | par-press-cut | UP-PL5403 | 3 | 162 (EXACT) | 486 | 2.1 | 17 % |
| both | beam380-backstage | UP-B380F | 7 | 500 (EXACT) | 3,500 | 15.2 | 119 % |
| both | beam380-columns-6 | UP-B380F | 6 | 500 (EXACT) | 3,000 | 13.0 | 102 % |
| both | bsw250-ground | UP-250BSW | 6 | 280 (EXACT) | 1,680 | 7.3 | 57 % |
| both | beeeye-ground | UP-HK1915 | 4 | 350 (EXACT) | 1,400 | 6.1 | 48 % |
| both | laser-cut | UP-LA40WF | 2 | 1,200 (EQUIVALENT) | 2,400 | 10.4 | 82 % |
| both | hazer-back | EXT-HAZER | 2 | 1,150 (EQUIVALENT) | 2,300 | 10.0 | 78 % |
| Full only | hazer-hall | EXT-HAZER | 4 | 1,150 (EQUIVALENT) | 4,600 | 20.0 | 156 % |
| Full only | co2 | UP-Q108S | 6 | 20 (EQUIVALENT) | 120 | 0.5 | 4 % |
| Full only | spark | UP-YH600F | 4 | 500 (EQUIVALENT) | 2,000 | 8.7 | 68 % |
| Full only | smoke | UP-YZ31P | 4 | 1,500 (EQUIVALENT) | 6,000 | 26.1 | 204 % |

| version | total W | total A at 230 V, PF 1 | multiple of one 2,944 W circuit | circuits, lower bound (any types may share) | circuits if no two types share (whole fixtures) | DMX channels | universes of 512, lower bound |
|---|---|---|---|---|---|---|---|
| minimal-ground | 18,942 | 82.4 | 6.43 | 7 | 10 | 658 | 2 |
| full-ground | 31,662 | 137.7 | 10.76 | 11 | 18 | 696 | 2 |

**No circuit assignment exists in the repo for these two versions** (`assignCircuits` runs only when asked, "never
mixing positions and never above the limit"); the two circuit counts are arithmetic bounds, not a design.
Rental stock for the lights: B380F 13/18, 250BSW 6/12, HK1915 4/14, PL5403 21/50, COB200 7/8, LA40WF 2/2; Full adds
Q108S 6/6, YH600F 4/4, YZ31P 4/4; the hazers are from another supplier (RIG_BUILD §15.12 "rental lines"). The
watts of the effects machines and of the laser are EQUIVALENT figures for other makers' products.

### 4.2 DMX and cable runs

Channels use each type's default mode: 16 (B380F), 24 (250BSW), 21 (HK1915), 8 (PL5403), 2 (hazer, spark), 1
(smoke), and three ASSUMED modes: 4 (COB200), 11 (LA40WF), 3 (Q108S). A universe is 512 channels and a lamp is never
split across two (`RIG_BUILD.md` §13.2, ANSI E1.11 as the repo cites it). No patch exists for the ground versions
(the only patch file is `moxir-2026-10-17-minimal.patch.json`, for the older Minimal, RIG_BUILD §19).

Floor cable routes from the booth, along the nave walls (RIG_BUILD §15.12; the walked routes are in
`moxir-ground-movers-2026-09-30.json` `places[].cable_floor_route_m`): backstage B380F 11-15 m round the press; column
B380F 17-42 m (10.9 m across, then along the wall); 250BSW 23-47 m; HK1915 about 22 m (z -6) and 53 m (z 48). The
ground fixtures stand along both walls from z -6 to 48 (x +/-10.6 to 11.2), about 54 m. The crew's cable plan
along the nave wall is OWED. Two rows of floor fixtures need feed, and cable that crosses the floor or an aisle is a
trip and escape-route matter for the signer.

### 4.3 UNKNOWN — to be measured or supplied by the signer

1. The venue's mains supply: voltage, phases, frequency, capacity, the boards' positions, the outlets and
   connectors, the supply's earthing system, residual-current protection; whether a generator is needed.
2. Whether the 2,944 W circuit is what is available; the repo treats every circuit as single-phase 16 A.
3. Inrush, diversity, the real running load (the sheet uses datasheet maxima, PF 1).
4. The real electrical draw and supply needs of the UP-LA40WF (1,200 W is EQUIVALENT); its interlock circuit.
5. Dimmers, relays or switched distribution for the machines (none in the repo); the LED fixtures are DMX-only.
6. Isolation and lock-out of the crane's own power (with the rigging engineer).
7. Bonding and earthing of the truss, the crane bridge and the hoists.
8. Distribution positions, cable routes, protection at crossings, separation of power, DMX and interlock cables.
9. The final DMX patch and the node or splitter plan; the modes the rental house's units actually use.
10. Test and inspection records the venue or the signer requires for the rental equipment.

### 4.4 Questions to put to the electrician

1. What does the hall's supply give us (phases, amps, sockets), and can it carry 18.9 kW (Minimal-ground) or
   31.7 kW (Full-ground)? If not, what do we bring?
2. How do you want the load split: how many circuits, of what rating, on which phases? The pack's 2,944 W circuit is a
   planning number.
3. What allowance do you add for inrush and power factor?
4. Which loads need dimmers or relays, and where does the distribution stand? The four 1,500 W smoke machines and
   six 1,150 W hazers in Full are the heavy items.
5. The laser: what does it really draw, and what supply arrangements does its interlock need?
6. How is the old crane's power isolated for the whole event, and who holds the key?
7. Route: 23 movers and 11 PARs along both walls, up to about 54 m from the booth, plus the two lasers and the
   statics on the truss. Where do the runs go, what protection at crossings, what separation of power and DMX?
8. Which DMX transport (cable, nodes, network) do you want, and who will produce the final patch (at least 2
   universes)?
9. Do you require the truss, the bridge and the hoists to be bonded, and how?
10. What must the rental house show you before power is switched on?

### 4.5 Sign-off block — electrics

| | |
|---|---|
| Name | |
| Organisation, qualification, registration number | |
| Date | |
| Scope signed for (tick): supply and distribution; circuits and protection; earthing and bonding; cable routes; DMX; crane isolation; other: | |
| Standard(s) applied (the signer names them) | |
| Decision (one): approve as drawn / approve with conditions / not approved / more data needed | |
| Conditions | |
| Own calculations and test records attached (list) | |

**This document is an information pack, NOT a design or a compliance statement.** The power figures are datasheet
maxima and stand-ins, not an electrical design.

---

## 5. Not in these three signatures (owed to others)

The effects operator and the venue: CO2 and cold-spark exposure and distances to the crowd, the smoke and haze
against detector cover (RIG_BUILD §15.12 lists these as UNVALIDATED); the crowd barrier and escape routes; fire
safety; the crew's cable plan. The owner's own look at the two versions on the real surface (never done: RIG_BUILD
§15.12 and the session note say geometry and tests only).

## 6. Provenance, method and limits

Read for this pack (all in this repo): `docs/architecture/RIG_BUILD.md` §2.5, §13.2, §15.7, §15.8, §15.12;
`scripts/place/rigs/moxir-2026-10-17-minimal-ground.json`, `...-full-ground.json` and the other `moxir-2026-10-17-*.json`
rig files (`truss.rigging.load`); `moxir-versions-2026-10-17.json`; `moxir-ground-movers-2026-09-30.json`;
`moxir-hall-2026-09-28-crane-dj.hall.json`; `moxir-hall-dims-2026-09-28.json` and `...-09-29.json`;
`src/rigbuild/types/moxir.json`; `src/rigbuild/sheet.js`; `scripts/rigbuild/ground-movers.mjs` and its test.

Method: values copied from the files with their path; the laser positions, aims and clearances were obtained by
building both rigs in every look with the repo's own `buildRig`/`buildAllLooks` and reading the spot-light entities;
the rest is stated arithmetic (kN = kg x 9.80665 / 1000; A = W / 230; % = W / 2,944; circuits = whole-fixture
ceilings; universes = channels / 512). The throwaway script that produced the CSVs was not committed (this pack is
docs only); the tables here and the CSVs come from the same run. The repo's tests were not run for this pack.
Nothing has been seen in the hall, on a screen or on the owner's install; nothing was measured.

**Found while making this pack (repo statements that disagree; owed as fixes, not changed here):**
1. Girder underside 8.15 m (committed hall, rig text) against 7.95 m (09-29 measurement and built hall); the
   versions file `spec.hall` still points at the 09-28 hall.
2. The rig files' `assumptions[4]` says the lasers "stand on the top plates of the two towers (7.15 m)": true of an
   older version, false for both ground versions (no towers; the lasers are on the cut). The built positions in 3.2
   are the ones to use.
3. `truss.rigging.load.method` says a bridle leg is on-bridge load / (2 cos half the included angle); the leg values in
   the file reproduce as (on-bridge load minus the 6 kg hardware) / (2 cos half the angle), about 6 kg less per leg.
   The engineer's own bridle analysis replaces both.
4. The hall model gives two crane heights and two crane positions for the far crane (z -41 committed, -22.2 built).

**Owed (the proper route):** commit the generator of the three CSVs as a script with a `--check`, so the pack cannot
drift from the rigs (as `ground-movers.mjs --check` does); re-derive the truss heights on the measured girder
underside once one tape measure exists; the signers' answers, recorded here with their names and dates.
