# MOXIR audit, Area A: the rig against reality
Project: dev `moxir-hall-known-full` (rigVariant id `known-full-ponyo-10-04`). Read-only. Code at origin/dev 7a751cf3.
Read 2026-10-04/05. The dev document moved from version 1 to 2 while I read it (see A-30); entities were identical in both reads, only `worldState` and `projectMeta` differ.
Evidence tags: CONFIRMED = I saw the value (path or file given). SUSPECTED = inferred, or I could not see the deciding fact.
Working copies of everything I read are in this folder: doc.json (v1), doc2.json (v2), rig.json, versions.json, fixtures.json, hall.json, hall.glb, lamps.txt.
Paths are origin/dev unless stated; "doc" = GET /serverXR/api/projects/moxir-hall-known-full/document.

## Verdict
The lights themselves are in good shape. 50 PARs, 18 B380F and 6 LaserCube match the rig file group by group, and the DMX patch has no overlaps.
The rigging, the hall and the order are not yet "what we see is what we will get":
1. The hall in the project dropped the 09-29 measured crane heights, so the hang is drawn and derived 0.2 m too high.
2. Six class-4 lasers are aimed at a hole in the roof, and they are dark in all 25 looks.
3. One tie-off passes through the crane cab.
4. The order, the equipment page and the rig disagree on 5 lines.
5. The DMX channel maps are unknown, so the patch is provisional.

## A. Fixture-by-fixture: rig vs order vs owner's gear

| item | 27 Sep order (list in rig `provenance.fixtureList`) | equipment csv (~/Downloads/rig-equipment/moxir-hall-equipment.csv) | rig on dev | verdict |
|---|---|---|---|---|
| UP-B380F | 18 | qty 18, placed 18, 500 W, 16ch | 18 (7 backstage floor z -1.5, 10 column bases z 24-48, 1 lighthouse z -48) | match |
| UP-PL5403 | 50 | qty **24**, stock 50, placed 24, mode owed | 50 (16+8+4 column uplights, 6+4+7 truss, 3+2 press, 4 neighbours... total 50) | order and rig agree; csv qty disagrees (A-12) |
| UP-250BSW | 12 | 12 / placed 8 | 0 | in order, not in rig |
| UP-HK1915 | 8 | 8 / placed 8 | 0 | in order, not in rig |
| UP-LA40WF | 2 | 2 / placed 2 | 0 | in order, not in rig. Replaced by the owner's 6 LaserCube |
| CO2 x6 (UP-Q108S) | 6 | 6 / placed 6 | 0 | in order, not in rig |
| cold spark x4 (UP-YH600F) | 4 | 4 / placed 4 | 0 | in order, not in rig |
| smoke x4 (UP-YZ31P) | 4 | **no row** | 4 (nave columns, circuits C12-C15) | rig has it, csv lacks it |
| hazers | none in the rental list | MDG ATMe x2 (other supplier, 1400 W, 3ch, placed 0) | **6** `EXT-HAZER` (2 booth back, 4 nave columns), modelled on Antari HZ-1000, 1150 W | conflict (A-13) |
| Art-Net node | n/a | 1 x, 4 universes | not an entity. The patch needs 2 universes | fine on capacity, node not in the rig |
| LaserCube Ultra MK2 (owner's own) | n/a | not in csv | 6 (matches the owner's 6) | match. Weight 3.7 kg and 10 W RGB are on the maker's data (fixtures.json) |
| truss, hoists, riser decks, barrier, stair | not in csv | not in csv | 4 x H30V-L300, 3 x 500 kg hoists, 3 decks, 9 m barrier, 6 treads | no line in the csv or the order (A-14) |

Fixture entities in the doc, counted:
- 74 spotLight: 50 up-pl5403, 18 up-b380f, 6 ext-lc-ultra-mk2.
- 10 groups: 6 hazers and 4 smoke machines.
- 7 piece models: 4 truss pieces and 3 decks.
- 34 boxes: table, 6 stair treads, barrier, and the rigging (3 hoists with bridles, clamps, steels, 2 tie-offs).
- 1 root group carrying `rentalList`, `rigLooks` (25 looks), `rigVariant` and `rigBounce`.

## B. Findings

### SAFETY / SHOW-STOPPER

**A-01 [safety, show-stopper for the rigging sign-off] CONFIRMED. The project hall is the 10-02 layer, which skipped the 09-29 measured crane layer.**
- Evidence, project hall: doc `entities[0].components.venuePlan.overhead`: `crane-1.bottom` = 8.15, `runway` bottom 6.56.
- Evidence, 10-02 build: `scripts/place/rigs/moxir-hall-2026-10-02-crane-dj.hall.json`: `dims.crane_bridge_bottom_h_m` 8.15 ("derived: crane rail + 0.55, unmeasured"), `crane_rail_h_m` 7.6, `crane_bridge_depth_m` 1.5.
- Evidence, layer list: its `dimsFiles` are 09-28 dims, 09-28 features, 09-28 crane-dj and 10-02 dims. There is no 09-29 file.
- Evidence, the measured layer: `moxir-hall-dims-2026-09-29.json` and `moxir-hall-2026-09-29-crane-dj.hall.json`. From photo 007 (Criminisi single-view metrology) it gives:
  - rail 8.1 (range 7.8-8.4)
  - bridge underside **7.95** (7.7-8.25)
  - bridge depth 0.8
  - cab 2.1
  - The far crane was measured. The entry-end crane (the one over the DJ) is assumed identical.
- Evidence, the consequence: `docs/architecture/RIG_BUILD.md` §15.13 (line ~1689), by the repo's own test.
  - At 8.15 the high pick (u 5.25, apex 7.56) sits at 119.1 degrees.
  - At 7.95 the clamps are 0.24 m above the apex: **144.4 degrees, legs about 1.63 x the load**, over the 120 degrees limit (Donovan, Entertainment Rigging 2002).
  - I re-derived it: 2*atan(0.75/0.24) = 144.6 degrees.
  - The dev doc draws the clamps at y 8.0 (`rig-hoist-*-clamp-*`), i.e. the 8.15 assumption.
- Why it matters:
  - This is the whole hang: 3 bridled picks, trim 5.06 m, ends 3.44 / 6.55 m, both tie-offs, load split 44/146/59 kg.
  - The old note in RIG_BUILD ("the far-crane and girder-underside difference between the committed and built hall") is still owed. The 10-02 layer made it worse by also reverting rail 8.1 to 7.6.
  - The 10-02 dims note says "left unchanged on purpose: crane rail 7.6", but its sources list never mentions the 09-29 measurement.
- Fix:
  1. Add the 09-29 layer files to the 10-02 build, so 10-02 contains 09-29.
  2. Rebuild the hall.
  3. Re-derive the trims and bridles in `versions.mjs` at the measured height. The high pick will need a lower trim or a shorter bridle spread, or the line must move.
  4. Tape the entry-end crane's underside on site. One number settles it, and the sign-off cannot start before it.

**A-02 [safety] CONFIRMED geometry, real clash unverified. The house-right tie-off `rig-tieoff-hr` passes through the crane cab.**
- Evidence: from (5.554, 6.698, 4.8) to (11.6, 5.5, 6.0), doc `rig-tieoff-hr`.
- Cab: `hall.json` `geometry.cranes[0].cab` x 8.35-10.35, dz +-1.0 about z 4.8 (z 3.8-5.8), y 5.95-8.15.
- At x 8.35 the strap is at y 6.14, z 5.35, which is inside the cab box. It stays inside until about x 9.3 (y 5.95).
- The cab size is a placeholder (`dimsOrigin.crane_cab_h_m` = "placeholder"). 09-29 measured 2.1 m high.
- Why it matters: the strap or steel that stops the line sliding along the slope would have to run through the operator's cab.
- Fix: re-route the tie-off (to the column higher or lower, or from the other side). Re-run the clash check with the measured cab, and check the crane parked position (cab at +x end).

**A-03 [safety, SUSPECTED] Class-4 laser beams are aimed at an opening in the roof and may leave the building.**
- Evidence: laser entities (`rig-lasercube-cut-01..06`) at (x -4.84..4.77, y 4.18..6.75, z 4.91). Beams point up 22.6 to 30.1 degrees and toward +z.
- Evidence, aim rule: `laser-into-roof` in `scripts/place/rig-lib.mjs:642` targets `ctx.hall.geometry.truss_top_centre_m` = 13.3 at z = stage.front + 14 (about 20.2), and every beam converges on x about 0, y 13.35, z 20.4.
- That point is inside lantern 1 (x +-6, z 7.25-45.75, deck opening, bottom 13.35). The beams then reach y 16.4 at z 25.5-27.6, which is the lantern top (`hall-skylight` y 14-16.4, x -6..30, a skylight mesh).
- What I did not see: whether the lantern is glazed or opaque, or what the space-frame members at 10.3-10.8 m reflect. The material is not described in `hall.json` or the dims files.
- Positive, CONFIRMED: beam height above any standing surface is at least 5.72 m at z 7.5 (dance-zone front edge). Over the riser deck (1.2 m) the lasers start 3.0 m above it and rise. The >= 3 m rule holds as modelled.
- Not modelled: the real scan field. The LaserCube Ultra MK2's galvos are AT-40S, "35k pps @ 7 degrees" (fixtures.json). A scanned fan of +-7 degrees (or 7 degrees total, not stated) on a 22-30 degrees elevation stays upward, so it holds.
- Why it matters: 10 W class 4. Roof steel and glass reflections, and any beam leaving through a skylight, are the real hazards. The policy says "into the roof", not through it.
- Fix:
  1. Aim at the 10.8 m underside, or block the lantern.
  2. Get a laser safety officer's assessment of reflections and airspace (owner sign-off is already marked owed in `policy.movingFixtures.lasers.signoff`).
  3. Model the scan fan.

**A-04 [gap, show-stopper for "see the same"] CONFIRMED. The lasers are dark in all 25 looks and all 10 show cues.**
- Evidence: doc `rigLooks.looks[*].levels["truss-top/ext-lc-ultra-mk2"]` = 0 in every look, including `k-crown`, `k-hit`, `gs-laser-roof`.
- The owner's 6 LaserCubes are "streamed from di Raw" (policy.dmx), which the simulation does not draw.
- Why it matters: the sim shows no laser, so nothing of the laser can be "seen the same in real life".
- Fix: either say plainly that lasers are out of the sim (their beams in the sim are not the stream), or draw the streamed shapes (the rig's own "laser previs" is owed).

**A-05 [safety, gap] SUSPECTED. Power: one circuit over the planning limit at the PAR supply rating, and the supply is unknown.**
- Computed from the doc's per-lamp circuits and fixtures.json watts: 50 x 162 W + 18 x 500 W + 4 x 1500 W + 6 x 1150 W = **30.0 kW** on C1-C17.
- Planning limit from RIG_BUILD §4: 16 A x 230 V x 0.8 = 2944 W.
- C6 (16 column PARs): 16 x 162 = 2592 W. The maker's supply power is 200 W per PAR (fixtures.json `par.specs.power_w` note), so 3200 W, **over the limit**.
- C12-C15 (hazer plus smoke machine each): 2650 W, 90 % of the limit, with both heaters hot at once.
- Equivalent datasheets (Antari HZ-1000 for the hazer, Antari Z-1500 III for the smoke machine) stand in for unknown real units (`identified: NOT FOUND`).
- B380F is quoted two ways: 500 W (kept) versus 450 W rated (A-CN). Discharge lamp inrush is not modelled.
- "PDU datasheets": the PDU items in the catalogue (up-pdu60a/b) are DMX splitters (ENTTEC D-Split and GeNetix GD4IP equivalents), not power. No power distribution is in the rig and no cable plan exists. The hall supply (the scene's transformer, a mains source, or a genset) is unknown.
- Fix: move 2 PARs off C6, split hazer and smoke machine across circuits, and write down the supply and the cable plan.

**A-06 [safety] CONFIRMED ok. Strobe.** No look sets a strobe level. The rig has no strobe fixture (no EXT-STROBE on this version). The hardest change is `show.json`: `k-hit` and `k-fan-hit` cut with fade 0 and hold 4 s, so 0.25 per second, below 3/s. B380F strobe (1-12 / 1-25 / 0.5-14 Hz, the maker contradicts itself) and PL5403 strobe channels are unknown and unused. PASS.

**A-07 [safety, gap] CO2 / cold spark / smoke placement.**
- CO2 and cold sparks are in the order (6 and 4) and in the equipment page ("placed 6 / 4"), but 0 are in the rig. So there are no clearances to check.
- If they come back, the rule "Cold spark/CO2 distances" is unmodelled.
- Hazers and smoke machines: placements are on the floor at the nave columns (x +-10.6) and the booth back (x +-4.5, z 3.95). See A-10 and A-11 for the problems.

### WRONG-VS-REAL

**A-08 [wrong-vs-real] CONFIRMED. The scene's hall asset lacks the 10-02 permanent objects, though the plan data has them.**
- Evidence, asset: `hall-night.glb`, sha256 `df837baa7cf96b984a78d93fa2c0cfbdd6fdfdccf0c4b73feccb3a0157e3e48b`, 3,189,904 bytes (I downloaded it and hashed it).
- Evidence, built from the 10-02 dims: `hall-concrete` max y = 10.8, `hall-frame` y 10.3-16.31, `hall-deck` y 13.35-16.7, lantern x -6..6 / 18..30. Triangle counts equal `hall.json` for 13 of 17 meshes, including `hall-steel` 4368 (the roof-steel and runway meshes; the handrail rows are `left` only per dims).
- Evidence, the gap: four meshes are short, `hall-block` 180 vs 192, `hall-deck` 348 vs 360, `hall-machine` 72 vs 132, `hall-rust` 1028 vs 1100. That is 156 triangles, i.e. 13 boxes. `hall-machine` bbox is x -0.45..12, z -0.3..3.54, so the transformer (x -11..-9.5), the column-foot cabinets, the press pedestal, the side cabinets and the blower (z 20-25) are not in it.
- The `venuePlan.solids` in the same doc do list them (11 `massing_add` items, photo-estimated +-1.5 m in x, +-3 m in z).
- Why it matters: the eye sees an emptier hall than the one the clash rules and placements were run against.
- Fix: rebuild the GLB from the 10-02 hall.json (or state which build it is) and upload it. Not checked: the rig file's own `rigBounce.source` asset `4b0d561f...` is not among the project's 3 assets, so the bounce numbers come from a different hall build (unknown which).

**A-09 [wrong-vs-real] CONFIRMED in the model, LOW photo confidence. Right-side uplights fire through the right-row pipe rack and into a drum tank.**
- Evidence: `massing` `pipe-rack-1` (x 10-12, z 10-48, y 3-3.4), `drum-tank` (x 8-11, z 22-28, y 0-3).
- Clashes (my ray test against the doc's lamp positions and aims):
  - `rig-beam380-columns-02` at (10.4, 0.70, 24.0) sits inside the drum tank.
  - 5 of the right-side B380F and 6 of the right-side column PARs (par-columns-04, 06, 08, 10, 12, 14) run through the pipe rack at y 3.0.
  - `rig-par-press-cut-01/03`, `rig-par-press-sides-01/02` (z 3.53) sit inside the press pedestal and press-side cabinets boxes.
  - `rig-hazer-back-02` (4.5, 0.235, 3.95) is inside the press-side cabinets.
- Why it matters: if the pipes and tank are as drawn, 10 right-side lights and the right-hand beams are blocked or blocked in part. The pedestal-and-cabinets positions are +-3 m guesses.
- Fix: site check; clear or move lamps. The 10-02 note already says the hall's loose machinery is "due to be cleared".

**A-10 [wrong-vs-real] CONFIRMED. Hazer 04 and smoke machine 04 are outside the hall.**
- Evidence: doc `rig-hazer-hall-04` (10.6, 0.235, 55.2) and `rig-smoke-04` (10.6, 0.1, 55.2). The end wall inner face is z 54.5 (`hall.json` `end_wall_inner_y_m`), and `venuePlan.outline` is z +-54.5.
- Cause: the rule puts each at column z + 1.2 (column row at z 54).
- Fix: move to z <= 53 (or drop one) in `rig-lib.mjs` / the group rule, and rebuild.

**A-11 [wrong-vs-real] CONFIRMED. The `rig-hazer-*` and `rig-smoke-*` machines are stacked at the same x,z.** For example hazer 1 and smoke 1 are both at (-10.6, ., 7.2), and they share circuits C12-C15. Probably intended, but they cannot both stand there. Cosmetic until the real units are chosen.

**A-12 [wrong-vs-real] CONFIRMED. The equipment csv disagrees with the order and the rig.**
- PL5403: csv qty 24 / placed 24 (stock 50), order text "50x UP-PL5403" and the rig has 50.
- The csv "placed" column (250BSW 8, HK1915 8, LA40WF 2, CO2 6, spark 4) matches some other version's equipment page, not known-full.
- Rate for the B380F: 20000/day on the price list, 19000 on the hidden sheet (the csv flags it).
- Fix: re-export the csv from the known-full equipment page, or label which version it is.

**A-13 [wrong-vs-real] CONFIRMED. Hazers: csv and rig disagree.** The csv (the owner's equipment page) lists 2 x MDG ATMe (1400 W, 3ch, placed 0). The rig has 6 x `EXT-HAZER` modelled on the Antari HZ-1000 (1150 W, 2ch, weight in fixtures.json 74.6 kg, which looks like a unit slip. SUSPECTED). The manuals folder holds the MDG ATMe User Guide, so ATMe is the real candidate. The rig's `rentalList` says 6 hazers "to choose".

**A-14 [gap] CONFIRMED. No order or csv line for the rigging.** The csv has 9 rows, all lighting. Not in the order or csv: 4 x H30V-L300 truss (planned on Prolyte; the rental house's own truss and load table owed), 3 x 500 kg chain hoists with controller, bridle steels and shackles, 3 beam clamps per pick, 3 safety steels, 2 ratchet straps or steels, 3 decks (2 x 1 m), the stair, a 9 m barrier, cables, the Art-Net node. The rig leans on them. If they come from the venue or the crew it is fine, but it is unwritten.

**A-15 [gap] CONFIRMED. Ordered, paid-for lines the show does not use.** 250BSW 12 (180,000/day), HK1915 8 (108,000), LA40WF 2 (166,000), CO2 6 (45,000), cold spark 4 (78,000) = **577,000 AMD/day** (csv line totals). Whether they were cancelled is unknown. The rig's `rentalList` has only 50 PAR, 18 B380F, 4 YZ31P (and unpriced lasers/hazers) = 672,000/day at the rates shown.

### GAP

**A-16 [gap, high] CONFIRMED. DMX channel maps are unknown.** `fixtures.json`: B380F "channel ORDER published nowhere (owed)" (the maker also contradicts itself on its gobo wheel and strobe range), PL5403 one 8ch mode with order "owed". The csv flags `channels-owed`, `mode-owed`. The patch is addresses only: U1 57 fixtures to channel 512, U2 11 fixtures to 176, no overlaps (I checked all 68). The same look on real gear is not guaranteed until the rental units are tested.

**A-17 [gap] Truss and hang numbers I could check.**
- CONFIRMED arithmetic: lamps 17 PAR x 8 kg + 6 x 3.7 kg = 158.2 kg; truss 12 m x 6.3 kg/m = 75.6 kg; extras 10 % = 15.8 kg; total 250 kg. Per pick 44 / 146 / 59 kg. On the bridge (with hoist 20 kg, chain 0.59 kg/m x 12 m, 6 kg hardware) 77.6 + 179.2 + 92.1 = 349 kg.
- CONFIRMED: the rig's own load figure is 250 kg on a 12 m H30V, about 21 kg/m against the quoted 321.6 kg/m at 6 m span. I did not re-read the H30V loading table in the manuals folder, so the 321.6 kg/m is the rig file's quote, not re-checked by me.
- PAR weight is 8 kg (English page), 5.9 kg on the Chinese page. The rig uses the higher.
- Not found anywhere: the crane's rated load, the girders' flange type (a box girder may not take a flange clamp; the rig says "beam clamp on the inner edge of the bottom flange"), the old runway's condition, and the hoists' controller. All are marked owed in `truss.rigging.signoff`.
- Lowest points: bottom chord 3.44 m at house left; the hung PARs sit lower than the chord by their body (par-cut-x-01 pivot 3.58 m). The rig's own clearance note: over raised hands 0.94 m at the low end. No audience under the line (it hangs behind the barrier at z 4.8; the barrier is z 7.5).

**A-18 [gap] The DJ riser has no guard rail in the model.** The deck is 1.2 m high on three loose 2 x 1 m decks, and the table sits on the front edge. Stairs on the left (6 treads of 0.2/0.25 m). A 1.2 m platform with an open edge is a fall hazard; nothing in the rig names a rail, a skirt or a deck load rating. Unknown, owed.

**A-19 [gap, cosmetic] Press pedestal overlap.** `venuePlan` note: the pedestal overlaps the riser footprint by 0.3 m in z (photo estimate, +-3 m).

### DRIFT: does the dev project equal its rig code?

**A-20 CONFIRMED same. Counts and geometry.**
- All 12 groups match the rig file's `groups` counts (par-cut-x 6, bridge 4, curtain 7, columns 16, press-cut 3, press-sides 2, vista 8, neighbour 4, B380F 7+10+1, laser 6).
- Truss ends -6.04 / 5.55, slope 15 degrees (rotation 0.2618 rad), picks u -5.75/-0.5/5.25, tie-offs and load numbers match `rig.truss`.
- Laser positions (u +-1, 3, 5) match.
- Show cues in `mappingState.cues` match `moxir-2026-10-17-known-full.show.json` (10 cues, loop).
- The doc's `rigLooks` holds 25 looks (the show uses 10).

**A-21 [drift] CONFIRMED stale text and ids.**
- The rig file's `variant.summary` says "the 2 fixed UP-LA40WF, held dark"; the rig has 0 of them and 6 LaserCubes.
- `policy.movingFixtures.rule` says "the two lasers are fixed"; there are 6.
- The doc's `rigVariant.id` = `known-full-ponyo-10-04` and its title ends "PONYO 10-04", while the rig file's id is `known-full`.
- The rig file is stamped `writtenAt` 2026-09-28; the dev project was built 2026-10-04 18:07 UTC.

**A-22 [drift] SUSPECTED.** `rigBounce.source` hall asset 4b0d561f... is not in the project's assets. The bounce enclosure used for lighting is from some other hall file.

**A-30 [drift, state] CONFIRMED.** Between my two reads a client `apply-picture` wrote `setWorldState` version 2 (background #030304, fog near 60, far 250 = the rig's `night`). Version 1 had #000000 and fog 0-80. Someone is writing to this project; the dev document is not frozen. `looksWhy` still quotes "fog far ~80 m" for the haze, so the haze text and the fog no longer agree. Cosmetic.

## C. Hall model, as asked
- Asset: `hall-night.glb`, sha256 df837baa7cf96b984a78d93fa2c0cfbdd6fdfdccf0c4b73feccb3a0157e3e48b.
- Roof concrete: top y 10.8. **Yes**, the 10-02 value (was 11.0). Frame bottom 10.3.
- Steel without the right handrail: consistent. `hall-steel` equals the 10-02 triangle count (4368) and `runway_handrail_rows` is `["left"]`. I did not count the handrail geometry itself.
- Pointer in the rig file: `hall` = `moxir-hall-2026-10-02-crane-dj.hall.json`, the same one `venuePlan.source` names ("hall.py v2, 2026-10-02T02:21"). Match.
- But it is not "the measured hall": see A-01 (crane layer dropped) and A-08 (massing not in the GLB).
- Hall values still ESTIMATES by the file's own words: crane rail, roof height (medium, Soviet height series), column width ("GUESS"), crane girder depth ("GUESS"), the pin at 40.406524, 44.636560. Nothing here is taped.

## D. What passes
- 18 B380F, 50 PL5403 and 6 LaserCube match the order and the owner's own gear.
- No B380F or PAR beam passes the crane bridge or the hung line: the rig's own `buildRig` refuses those.
- Movers are on the floor: 18 B380F at y 0.70 m (pivot) on the floor and none above. Policy 0.6 m refers to the mounting face. I could not confirm the face height, so SUSPECTED ok.
- Lasers: none on a moving mount, no beam below 5.7 m over the dance zone, 3.0 m over the riser as modelled.
- Strobe: none, cuts at most every 4 s.
- DMX: 68 fixtures, U1 ends at 512 exactly (backstage beam 7 at 497-512, with no spare), U2 at 176. The csv's Art-Net node is planned for 4 universes.

## E. Owed, in order (my view)
1. A-01: add the 09-29 layer into the hall, rebuild, re-derive the hang. Tape the entry-end crane's underside on site.
2. A-02, A-10: re-route the hr tie-off; move hazer/smoke 04 into the hall.
3. A-03, A-04: the laser aim point, the lantern, and the laser safety officer. Decide whether the sim shows lasers.
4. A-16: test one PL5403 and one B380F from the rental house for the channel order, before the sim's look is called the show.
5. A-12 to A-15: one equipment list for known-full that matches the order, the csv and the rig. Decide on the 5 unused order lines.
6. A-05: circuit C6 and the hall supply.
7. A-08, A-09: rebuild the GLB with the 10-02 massing and do the site walk for the pipe rack.
