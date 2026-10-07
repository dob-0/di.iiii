# MOXIR: model against the real hall (2026-10-07), crane parking, and the 10-08 site survey

**Asked.** Owner, 2026-10-07: *"we can move the crane, but we need to model maximum close to the real — one more check
of all, look what is right"*. The owner and Emilya go to the hall in Charentsavan (the **place**) on **2026-10-08**.

**Scope.** This checks the space `moxir`, the show version Known · full, and the flipped cut (branch
`feat/moxir-truss-flip-2026-10-07`, e489a6db, `scripts/place/rigs/moxir-crane-cut-flipped-2026-10-07.json`).
Everything here was read-only. Nothing was written to dev or local, and nothing was rendered.

**Tags.** **CONFIRMED** means I saw the value, and the file and line are given. **SUSPECTED** means it is inferred, or the deciding fact is not in any file.
Hall frame: metres. y is up from the floor. z runs along the hall: 0 is the expansion joint and +z is toward the entry. x runs across the hall: 0 is the nave axis and +x is house right.

## 0. What matters most (read this if nothing else)

1. **The flipped cut is still drawn 0.2 m too high. CONFIRMED.** The branch's hall is
   `moxir-hall-2026-10-02-crane-dj.hall.json` (versions file line 1736). Its `dimsFiles` are the 09-28 dims, the 09-28 features,
   the 09-28 crane-dj and the 10-02 dims. The 09-29 measured crane is not among them. So the model has:
   - girder underside 8.15 ("derived: crane rail + 0.55 m, unmeasured", `dimsOrigin`)
   - rail 7.6
   - girder depth 1.5
   - cab 2.2 ("placeholder")

   Photo 007 measured these on 09-29 (`moxir-hall-dims-2026-09-29.json` lines 7–40):
   - girder underside **7.95** (7.7–8.25)
   - rail **8.1** (7.8–8.4)
   - girder depth 0.8
   - cab 2.1

   PR #772 carries these into the 10-02 layer, but #772 is **OPEN, not merged**, and the flip branch was cut without it. The cut's own
   text still says "girder bottom 8.15 m — ESTIMATED; rail 7.6 m" (`moxir-crane-cut-flipped-2026-10-07.json` line 97).
2. **The whole cut moves 1:1 with the near crane's girder underside, and that number has never been measured on the near crane.**
   The 7.95 m is the *far* crane's value, and the near crane is assumed to be the same type. Measured on `craneCut` (below):
   - at 7.95: the low end is 3.24 m, 0.74 m over raised hands
   - at 7.70 (the bottom of the range): the low end is 2.99 m, 0.49 m over raised hands, under the 0.5 m rule that #772 uses
3. **The gap between the two bridge girders is a hard-coded guess, and it moves the trim.** hall.py line 681 sets
   `girders_dz_m [-1.1, 1.1]` and `girder_w_m 0.7`, which gives a 1.5 m inner gap. No file gives a source. The bridle geometry turns this gap into trim:
   **−0.29 m of trim per +1 m of gap** (1.0 m gap: trim 5.00; 2.5 m gap: trim 4.57, low end 2.95, 0.45 over hands).
4. **No file says how far the cranes can travel.** CONFIRMED absence: no `travel`, end-stop or runway-extent key exists in any
   dims, features or hall file. Within the window the code allows, where the crane parks does not change the cut at all. It only changes
   the tie-offs' skew and the distances to the press and the barrier (§3).
5. **The press face sets everything along the hall.** The DJ's z is derived as press face + 1 m gap, and the code refuses a crane
   more than 1 m from the DJ (`rig-lib.mjs` stageFrame, line ~190). The press face is a photo fit, z 3.2 in a range of 2.0–4.5 (rig
   `moxir-2026-10-17.json` stage.estimated). That is the top along-hall measurement for 10-08.

## 1. Model against the real: every fact the rig depends on

"Rig effect" means what moves in the flipped cut (or the rig around it) if the value is wrong. Numbers marked "craneCut" were computed by the
branch's own `scripts/rigbuild/versions.mjs` `craneCut` → `versionRig('known-full')` on copies of the 10-02 hall
(script `park.mjs` / `spread.mjs` in the session scratchpad; no new geometry code).

| # | Fact | Model value | Source (file) | Confidence | Range | Rig effect if wrong | Tag |
|---|---|---|---|---|---|---|---|
| 1 | Span (row to row) | 24.0 m; rows x ±12 | dims-09-28 l.6; satellite 4×24 m + photo span/pitch 3.96 | high | 22–25 (09-27) | moves the tie-off anchors (x ±11.6) and the crane rail (±11.35); the tie-off lengths change, the trim does not | CONFIRMED |
| 2 | Pitch | 6.0 m; grid z 54, 48 … 6, ±0.5, −6 … | dims-09-28 l.7; GOST 23838-89 | medium-high | 5.5–6.3 | the tie-off grid line (z 6.0), the column uplights, the PAR at each column foot | CONFIRMED |
| 3 | Bays / length / end walls | 18 / 108 m / z ±54.5 | dims-09-28 (satellite roof 106.5, grid-snapped) | medium | 17–18 / 105–109 | the end-wall positions: hazer/smoke 04 stood at z 55.2, outside the hall (audit A-10); the cranes' travel ends | CONFIRMED |
| 4 | Expansion joint = model z 0, paired columns at ±0.5 | z 0 | dims-09-28 `paired_columns_at_joint`; site-09-28 `joint_v_m` (lantern gap) | medium | ±1.5 m (site-09-28 `uncertainty_m`) | it is the z origin of every along-hall number; the press (z 0.2–3.2) stands right at it | CONFIRMED value / SUSPECTED place |
| 5 | Column section; inner face | 0.5 × 0.8 m (GUESS); inner face x ±11.6 | dims-09-28 `column_w_m`, `column_d_m` "GUESS"; hall.json `column_inner_face_x_m` | guess | 0.4–0.6 × 0.5–0.8 | tie-off length ±0.2 m; whether a 2 t strap fits round it | CONFIRMED (guess) |
| 6 | Column head (Y flare) | flare from 5.71, head top 6.56 (follows rail 7.6) | hall.json `column_head` | medium form / guess size | with rail 8.1: 6.21 / 7.06 | the house-left (high-end) tie-off is anchored at 5.5 m, under the flare and the runway; this holds for either rail | CONFIRMED |
| 7 | Roof bottom chord | 10.8 m | dims-10-02 l.6 (Soviet series 8.4/9.6/10.8/12.0) | medium | 10.6–11.2; photo 007 check 11.26 (10.79–11.73, low) | none on the cut; the laser landing heights (A-03) and the crane's top clearance | CONFIRMED |
| 8 | Space frame | 6×6 m, 2.5 m deep, top chord 13.3 | dims-09-28 / 10-02 | medium | depth 2.1–3.0 | none on the cut; where lasers land | CONFIRMED |
| 9 | Nave lantern | 12 m wide, x ±6, z 7.25–45.75 and −45.75…−7.25; h 3.2 (dims), drawn 3.35, top 16.7 | dims-10-02; hall.json `lanterns`, `lantern_h_m` 3.35 | medium | h 2.77–3.5 | none on the cut; class-4 laser beams aimed into it (A-03); glazed or open is unknown | CONFIRMED (dims 3.2 vs drawn 3.35 is a small internal difference, SUSPECTED derivation) |
| 10 | **Crane rail top** | **7.6** (runway top 7.46, bottom 6.56) | dims-09-28 l.10, kept by 10-02 ("left unchanged on purpose") | low-medium "disputed" | **measured 8.1 (7.8–8.4)**, dims-09-29 l.7, photo 007, Criminisi single-view metrology | not an input to the cut; it sets the runway and column-head heights, and it is the cross-check for the girder (09-29: the girder underside is 0.12 m BELOW the rail head) | CONFIRMED |
| 11 | **Near-crane girder underside** | **8.15** ("crane rail + 0.55, unmeasured") | hall.json `cranes[0].girder_bottom_m`; `dimsOrigin` | none (derived) | **measured 7.95 (7.7–8.25) on the FAR crane**, dims-09-29 l.17; the near crane is ASSUMED the same | **1:1 on everything.** craneCut: 8.25 → trim 5.16, low end 3.54; **8.15 → 5.06 / 3.44 (in the branch)**; **7.95 → 4.86 / 3.24, 0.74 over hands**; 7.70 → 4.61 / 2.99, **0.49 over hands**. The bridle angles stay 119/42/26° because the trim is derived from the girder | CONFIRMED |
| 12 | Girder depth | 1.5 (girder top 9.65) | dims `crane_bridge_depth_m` 1.5 (GUESS) | guess | measured 0.8 (0.7–0.9), dims-09-29 l.27 | none on the cut; the crane-to-roof clearance and how it looks | CONFIRMED |
| 13 | **Girder inner gap** (bridle leg spread) | **1.5 m** (girders ±1.1, 0.7 wide) | **hall.py l.681, hard-coded, no source** | guess | unknown (double-girder 24 m bridges: about 1–2.5 m, SUSPECTED) | craneCut at girder 7.95: gap 1.0 → trim 5.00, low end 3.38; **1.5 → 4.86 / 3.24**; 2.0 → 4.71 / 3.09; 2.5 → 4.57 / 2.95 (0.45 over hands). The middle and low bridles change 31–59° and 18–39° | CONFIRMED value / SUSPECTED range |
| 14 | Girder bottom flange | "beam clamp on the inner edge of the bottom flange" | cut file `rigging.bridle.attach` | not seen | box girder or plate girder unknown | if it is a box girder with no flange lip, a flange clamp may not fit and the attachment changes (audit A-17) | CONFIRMED (unknown) |
| 15 | Cab | x 8.35–10.35 (hall.py l.671 `xb − 3.0`), dz ±1.0, y 5.95–8.15 (2.2 m "placeholder") | hall.json `cranes[0].cab`; `dimsOrigin.crane_cab_h_m` | side medium-high (photos 002–013); size placeholder | measured cab 2.1 m high, bottom 5.85 (far crane) | flipped cut: the low end (x 6.04, 3.24–3.44 m) and the house-right tie-off (y 3.39–3.59) pass ≥ 2.2 m under the cab, so the A-02 clash is gone with the flip. The cab's x-extent is still a hard-coded guess | CONFIRMED |
| 16 | Near-crane trolley / hook | trolley x 7.6–10.2 (plan: parked right), y 9.65–10.65; hook not modelled | crane-dj-09-28 `crane_trolley_x_m` [7.6, null] | plan | unknown | the trolley must be parked and locked; a low hook block near x 8.9 would hang 2.9 m from the cut's low end. The far crane's hook hung to 3.7 m on 08-24 (features-09-29 `seen_not_modelled`) | CONFIRMED (plan) |
| 17 | **Near-crane position** | z 4.8 (`cranes_from_door_m` 49.2 from the ENTRY GRID LINE z 54, not the door wall 54.5) | crane-dj-09-28/29; dims-10-02 l.284 | **PLAN, not seen**. As seen on 08-24 it stood at the entry end: photo-032 camera z 50.2; features-09-28 says "4.0 from door" | — | the cut hangs at the bridge's z; the code refuses a crane > 1 m from the DJ (§3) | CONFIRMED |
| 18 | Far-crane position | z −22.2 (76.2 from the entry grid line) | features-09-29 `cranes_from_door_m_source` (photo 007: D = 69.1 m) | medium | z −26.0…−18.4 | it bounds the near crane's travel on the far side (it cannot pass) | CONFIRMED |
| 19 | **Crane travel, end stops, power** | **not modelled** | no key in any file (I searched every dims, features and hall file) | — | — | it decides which parking positions are real. Photos 004/009 show both runways continuous to the far wall (SUSPECTED, by eye) | CONFIRMED absence |
| 20 | Neighbour-span cranes | left 60, right 30 m from the door | features-09-28 `neighbour_cranes_from_door_m` "GUESS" | guess | — | none on the cut | CONFIRMED |
| 21 | **Press** | x 0.25–3.05, z 0.2–3.2 (face 3.2), h 4.2, crown 4.2–5.6 (flywheel top 5.6) | hall.json massing `press`, `press-crown`; photo-032 fit ±20 %, depth 3 m GUESS | medium-low | face z 2.0–4.5 (rig stage.estimated) | **sets the DJ's z (face + 1 m) and so where the crane must park**; at face 4.5 the DJ is at 6.3 and a crane at 4.8 is refused. The cut at z 4.8 is 2.06 m in front of the crown | CONFIRMED |
| 22 | Machine line + pipe | x 3.05–12, z −0.5–2.5, h 2.4; pipe y 2.8–3.3 at z 1.0–1.6 | hall.json massing; dims-10-02 note "HELD: may run on to z 10–14" | low (depth guess) | z end 2.5 … 14 | if it runs to z 10–14 it stands under the cut's low (house-right) half and in the dance floor's right edge | CONFIRMED |
| 23 | Press pedestal / press-side cabinets | x −1…0.5, z 3–4.5, h 1.2 / x 2–5, z 3–8, h 1.6 | dims-10-02 massing_add (photos 024, 035) | medium-low / LOW | ±1.5 x, ±3 z | the pedestal overlaps the riser by 0.3 m; the cabinets stand under the cut's low half (≥ 2 m clear); 3 press PARs and a hazer sit inside these boxes (A-09) | CONFIRMED |
| 24 | DJ riser + barrier | x −1.5…1.5, z 4.2–6.2, deck 1.2; DJ z 5.0; barrier z 7.5 (pit 1.3) | rig `moxir-2026-10-17.json` stage (derived from the press face + gap 1) | derived | riser front 5–7.5 | the crane's allowed z window is DJ ±1 m; the cut sits ≥ 1 m behind the barrier | CONFIRMED |
| 25 | Entry door + platform (+z end) | door z 54.5, 6 × 6 m; `entry_platform: true` (no size) | features-09-28 "GUESS (video 026)" | guess | — | none on the cut; load-in path, egress, hazer placement | CONFIRMED |
| 26 | Far wall + gate | z −54.5; gate 4.8 × 5.4 | 10-02 chain (09-28 features) | — | **measured 5.6 × 7.2 (features-09-29, photo 007) — not in the 10-02 hall** | none on the cut | CONFIRMED |
| 27 | **Right-row pipe rack** | x 10–12, **z 10–48**, y 3.0–4.5 (3 pipes) | dims-10-02 massing_add "run length is a guess" | LOW | z start unknown | **if the pipes reach z ≤ 6, the house-right tie-off (y 3.39–3.59 at x 10–11.6, z 6) runs into them**; 11 right-side lights fire through them (A-09) | CONFIRMED value / SUSPECTED clash |
| 28 | Transformer, column-foot cabinets | x −11…−9.5 / −12…−11, z −4…4 | dims-10-02 massing_add (photos 020–022) | medium x,y / LOW z (±3) | — | none on the cut; is it live? | CONFIRMED |
| 29 | **Power points** | **none in any file** | audit A-05: "the hall supply is unknown" | — | — | 30 kW of lamps and effects plus 3 hoists (400 V) need a source; the crane needs power to travel | CONFIRMED absence |
| 30 | Loose items under the cut | 5 pressure vessels x −6…0, z −2…+8 (not drawn, "due to be cleared"); a roller conveyor near x −5…−6, z 3…14 (VGGT ±5 m) | dims-10-02 notes; features-09-29 `seen_not_modelled` | low | — | under the high end and the riser; if they stay, they block the riser and the stair | CONFIRMED (text) |
| 31 | Floor rails | one track at x ≈ 0, z 20–54.5; cross lines at z 38, 46 | dims-10-02 `track_*` | LOW | — | riser feet and barrier feet; trip lines in the dance floor | CONFIRMED |
| 32 | Low wall, left row | z 18–30 (from the door 24–36), h 3 | dims-10-02 `low_walls` | medium | — | none on the cut | CONFIRMED |

**Photos (EXIF read, 4 opened).** They come from three days:
- 000–015: iPhone 14 Pro Max, **2026-08-24** 16:39–17:03
- 017–025, 036–038: Galaxy S24 13 mm-eq, 2026-09-17
- 856–867: Fujifilm X-T5, 2026-09-26

027–035 are video frames with no EXIF. **Every crane position in the files is as it stood on 08-24** (CONFIRMED by EXIF). Photos 004/009 were taken from beside the near crane's bridge at the entry end.
In 004/009 both runways look continuous down the hall, and the far crane is in view near the far wall (SUSPECTED, by eye).
In 007 the far crane's cab (striped) hangs at its right end, and its trolley sits near mid-span with a festoon cable along the bridge, so the crane was powered at some point (SUSPECTED).

## 2. What else I found on the way

- **CONFIRMED.** At girder 7.95 with the branch's trim, the house-left high pick would open to about 144° (the mirror of A-01). This is recorded in
  `bridle-limit.test.js` per the flip session note. The fix is #772's re-derivation. The flip and #772 must be merged and re-derived
  together, and #772's `hr` tie-off change (anchor 4.6 m) belongs to the UNflipped cut only.
- **SUSPECTED (latent).** `versions.mjs` line 322 computes `clearance.lowest_m` from `bottomAt(uEnds[0])`, which is the −x end only, plus the hung lamps.
  In the flipped cut the −x end is the HIGH end. The value is right today (3.44) only because a hung lamp lands on the low end. The note on line 328
  still says "the low end is over the back of house-left", which is stale after the flip.
- **CONFIRMED.** `cranes_from_door_m` is measured from the entry **grid line** (z 54), not the door wall (z 54.5): 54 − 49.2 = 4.8 and
  54 − 76.2 = −22.2. On site, measure from a column grid line, not the wall.
- **CONFIRMED.** The audit's A-08: the hall GLB in the project lacks the 10-02 massing. Any visual check on the screen shows an emptier hall than the clash rules use.

## 3. Crane parking: the options, run through `craneCut`

The constraints, as the code holds them:
- `stageFrame` (rig-lib.mjs) refuses a crane more than 1 m from the DJ.
- The DJ is at the press face + 1 m gap + 0.8 m, which is z 5.0 in the model.

So with the DJ where it is, the near crane may park at **z 4.0–6.0**. Every row below is at the measured girder 7.95 m. In every allowed row:
- trim 4.86
- ends 6.35 (house left) / 3.24 (house right)
- bridles 119/42/26°

| crane z | DJ z | to press crown (z 2.6) | near girder edge to barrier | tie-off skew (along z) | verdict |
|---|---|---|---|---|---|
| 3.5 | 5.0 | — | — | — | **refused** by the code (> 1 m from the DJ) |
| 4.0 | 5.0 | 1.25 m | 2.05 m | 2.0 m over ~6 m (≈ 18°) | allowed; crowded against the crown and flywheel, worst tie-off pull |
| **4.8 (now)** | 5.0 | 2.06 m | 1.25 m | 1.2 m (≈ 11°) | allowed; the plan of 09-28 |
| **5.0** | 5.0 | 2.26 m | 1.05 m | 1.0 m (≈ 9°) | allowed; the line straight over the DJ |
| 5.5 | 5.0 | 2.76 m | 0.55 m | 0.5 m (≈ 5°) | allowed; bridge edge 0.55 m behind the barrier line (8 m up) |
| 6.0 | 5.0 | 3.26 m | 0.05 m | 0 (square to the line) | allowed (at the 1 m limit); tie-offs square; the bridge's edge reaches the barrier line |
| 6.0 / 6.5 / 7.0 with the DJ moved forward (gap 2 / 2.5 / 3) | 6.0 / 6.5 / 7.0 | 3.3–4.3 m | 1.05 m (barrier moves too, to 8.5–9.5) | 0 / 0.5 / 1.0 m | possible, but the dance floor's front edge moves 1–2 m back toward the entry (≈ 11–21 m² lost on a 10.7 m wide floor) |

The cut's heights, slope, loads and bridles **do not change** with the crane's z in this window. CONFIRMED: craneCut gives identical
trim, ends and bridles at every z. What changes:
- the tie-offs' skew. They go to the nearest column grid line, z 6.0, so z 6.0 makes them square to the line and any other z puts a z-component on the V bridles.
- the room between the press crown and the bridles.
- how far the bridge is from the crowd.

**Where the crane can physically go. SUSPECTED, owed to the site check.** The near crane shares its runway with the far crane (z −22.2), so it can
run from just short of the far crane (about z −17, allowing ~5 m for both bridges' end trucks; the trucks' wheelbase is unknown) to the
entry-end stops (it was parked at about z 50 on 08-24). All of the 4.0–6.0 window is on the entry side of the joint, so it does not
cross the expansion joint. Whether it can be driven at all depends on things no file records:
- runway power
- brakes
- the crane's condition

A ~24 m bridge crane weighs many tonnes, so moving it is a job for the site's crane operator, not for pushing by hand (SUSPECTED).

**Recommendation.** Park the near crane with its bridge centre line **over the DJ's measured centre (model z 5.0), and if the
measured DJ lands within 1 m of the grid line z 6.0, prefer z 5.5–6.0**. The reasons:
- Tie-offs square to the line hold it along x without pulling it across the bridge.
- It keeps 2.3–3.3 m between the bridles and the press crown and flywheel.
- The line stays ≥ 1 m behind the barrier.

Do not park below z 4.5: it is close to the crown, and the tie-off skew grows past 11°. Nothing in the cut needs re-deriving for any of these
positions. Change `cranes_from_door_m[0]` to `54 − z` in the measured layer, and the hall and the rig follow. **The real decision
depends on two numbers from 10-08:**
- **the press face z**, which sets the DJ
- **the near crane's girder underside**, which sets every height

Lock out the crane wherever it is parked (the cut file's sign-off line).

## 4. Site survey for 2026-10-08 (ranked, most rig-critical first)

**Before you start:**
- Pick the datum. **z 0** is the midpoint between the two paired columns at the expansion joint (find them first: two columns about 1 m apart in each row, near the press). **x 0** is half the span between the two nave rows' inner faces, measured at grid line z 6.
- For every reading, photograph the meter's display AND the target.
- For heights, take 3 readings and write all of them down.
- Write each value into `scripts/place/rigs/moxir-hall-measured-2026-10-08.json` → `measurements.<key>` (value, method, by, at, photo, readings). Copy it to the top-level key only where `reads_it` says hall.py reads it.

Tools:
- a laser distance meter with a tilt read-out (±1.5 mm class, e.g. Leica DISTO or Bosch GLM)
- a 30 m tape and a 5 m tape
- a phone
- a 1 m reference (a folding rule)
- a plumb line or the meter's vertical mode

| # | What | Where to stand | Tool | Tolerance needed | JSON key (template) |
|---|---|---|---|---|---|
| 1 | **Near crane: floor to girder underside**, at mid-span and under each pick (x −5.0, +0.5, +5.6) | on the floor under the bridge; meter flat, beam straight up (tilt 90 ±0.5°) | laser | ±0.05 m | `crane_bridge_bottom_h_m` |
| 2 | **Near crane: inner gap between the two girders' bottom flanges, and each flange's width** | on the bridge walkway (if access is safe), or from below with a photo and a tape held across | tape / laser + photo | ±0.05 m | `crane_girder_inner_gap_m` (code owed: hall.py l.681) |
| 3 | **Press front face along the hall** (left and right foot) from the joint datum | on the floor, from the joint column face along the row, then across | tape / laser | ±0.1 m | `press_face_z_m` |
| 4 | **Rated-load plate** of the near crane (and the far one): t, maker, year | the bridge side or the cab | photo | exact | `crane_rated_load_t` |
| 5 | **Crane travel:** end stops at both runway ends, any stop or rail break at the joint, power (conductor rail or festoon), brakes, who drives it | both runway ends, the joint, the cab; ask the site owner | photo + laser | ±0.5 m | `crane_travel_z_m` |
| 6 | **Bottom flange type** (box or plate girder), flange thickness where a beam clamp bites | bridge walkway, close photo with a tape | tape + photo | ±5 mm | `crane_girder_bottom_flange` |
| 7 | **Both cranes' positions as found** (bridge centre line), from the ENTRY grid line (z 54), not the door wall | plumb from the bridge centre to the floor; tape from the grid-line column face | laser | ±0.2 m | `cranes_from_door_m` |
| 8 | **Crane rail top**, both rows at grid line z 6 | on the floor beside the column (laser), or a tape from the walkway | laser | ±0.05 m | `crane_rail_h_m` |
| 9 | **Tie-off columns at grid z 6:** clear at 5.5 m (left) and at 3.2–3.6 m (right)? Can a 2 t strap go round? What is fixed there? | the nave floor facing each column; photo with a tape held up | photo + reference | yes/no + what | `tieoff_anchor_columns` |
| 10 | **Right-row pipe rack:** where it starts and ends in z, pipe heights, offset from the column face | under the rack | laser + photo | ±0.2 m | `pipe_rack_z_m` |
| 11 | **Cab:** floor to cab bottom, cab height, cab x extent from the axis | under the cab | laser | ±0.1 m | `crane_cab_h_m` (x extent: code owed, hall.py l.671) |
| 12 | **Trolley** x on the bridge; **hook block** height above the floor | under the trolley | laser | ±0.2 m | `crane_trolley_x_m` |
| 13 | **Span and columns at grid z 6:** inner face to inner face; column width × depth at 1 m and 5.5 m | across the hall, meter flat | laser + tape | ±0.05 m | `column_inner_face_x_m` (→ `span_m`, `column_w_m`, `column_d_m`) |
| 14 | **Pitch:** joint pair to z 6, z 6 to z 12; the gap between the paired columns | along a row | tape / laser | ±0.05 m | `pitch_m` |
| 15 | **Girder depth** (side plate) at mid-span | walkway with a tape, or top minus underside | tape / laser | ±0.05 m | `crane_bridge_depth_m` |
| 16 | **Press size:** x edges from the axis; height to the crown top and the flywheel top | beside the press; a 2 m tape against it for the photo | laser + photo | ±0.1 m | `press_size_m` |
| 17 | **Machine line:** where it ends toward the entry; top height; overhead pipe height | along the line | laser | ±0.2 m | `machine_line_z_m` |
| 18 | **Pedestal and press-side cabinets:** footprints, heights, bolted or loose | at each one | tape + photo | ±0.2 m | `press_pedestal_and_cabinets` |
| 19 | **Floor under the riser and the barrier line** (x −1.5…1.5, z 4.2–6.2; z 7.5): level, rails, plates, pits | on the spot | laser tilt + tape | ±0.02 m | `floor_level_dj_m` |
| 20 | **Power:** every live board near the stage (x, z, 400/230 V, breaker A, socket); is the transformer live; the crane's supply | with the site electrician | photo + note | exact rating | `power_points` |
| 21 | **Roof bottom chord** at a node over the floor (z ≈ 12 and ≈ 30) | on the floor under a node | laser | ±0.1 m | `truss_bottom_h_m` |
| 22 | **Lantern:** glazed, open or sheeted; panes intact (laser safety) | z ≈ 20, x 0, photo straight up | photo | yes/no | `lantern_glazed` |
| 23 | **Entry door and platform** (+z): clear width × height, sill, platform size and height | at the door | tape | ±0.05 m | `door_w_m` (`door_h_m`) |
| 24 | **Far gate** (−z): clear width × height | at the gate | tape / laser | ±0.1 m | `far_gate_w_m` (`far_gate_h_m`) |
| 25 | **Loose items gone?** Pressure vessels (x −6…0, z −2…+8), roller conveyor (x −5…−6, z 3…14?), gas cylinders | from the DJ spot, toward the entry and the left row | photo | yes/no | `loose_items_cleared` |

Why this order: items 1–2 set the height of every point on the line (1:1 and 0.29 m per m). Items 3 and 7 set where along the hall it
hangs. Items 4–6 decide whether it may hang at all (the sign-off). Items 8–12 are the clash checks of the flipped cut's tie-offs and low end. Items 13 onward
correct the grid and the objects around the stage.

## 5. Owed after 10-08

- Fill the template. Run hall.py with the 10-02 chain + `moxir-hall-measured-2026-10-08.json` last. Re-derive (`versions.mjs`).
- Merge #772 into the flip, and drop #772's `hr` 4.6 m anchor for the flipped cut.
- Teach hall.py the new keys: the girder gap and flange width, the cab x, crane travel, power points.
- Rigging sign-off (rated load, lock-out, hoists, safety steels) by a rigger or engineer. This file only draws it.
