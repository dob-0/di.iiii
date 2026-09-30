## 2026-09-30 — Light footprints: what every MOXIR lamp really lights, in numbers

- Branch `feat/light-footprints`, cut from `fix/ground-real-lights` (the two ground versions, their scenes and the real-light budget). No PR opened. The owner's ask, 2026-09-30: "simulate the light sizes — how in it the devices — to see the real result."
- New: `scripts/rigbuild/footprints.mjs`, `scripts/rigbuild/footprints.test.js`, one row in `scripts/rigbuild/README.md`. For a rig version file (`scripts/place/rigs/moxir-2026-10-17-<id>.json`: minimal-ground and full-ground by default, any version by `--version <id>` or `--rig <file>`) and every look (or `--look <id>`) it lists every lamp: fixture type, position, aim, the surface the aim lands on (floor / wall / roof / column / truss / crane / machine / DJ riser / open air), the throw, the beam angle used and where it comes from, the photometry basis, the spot diameter, the ellipse on a slanted surface, the candela, the lux at the spot's centre, and flags (wide over 6 m, tight under 0.5 m, dim under 1 lux, borrowed, no-figure, open-air, grazing, room-differs, out).
- Output: Markdown and CSV per version in ~/Downloads/moxir-devices/ (footprints-minimal-ground: 14 looks x 53 lamps = 742 rows; footprints-full-ground: 16 looks = 848 rows). `--words` prints the plain-words paragraph per look. Nothing is written into any install, and the files carry no date so a re-run is identical.
- Reused, not re-implemented: `buildRig` (positions, aims, reach, levels), `spotAimDirection` (the lamp's direction), `candelaAt` (candela, flux-scaled to the angle used), `craneSolids`, and `surfaceHit`, which the test holds the ray to.

### Method

- Throw: a ray from the lens along the aim against the floor, the roof deck (lantern openings up to `lantern_top_m` less 0.3 m), the end and side walls and the massing boxes (what rig-lib's `surfaceHit` stops a beam at), plus, because they are real steel, the columns (hall column grid), the cranes and the rig's own deck, DJ table, stairs and truss line. Nothing within the class's `reach_m` reads "open air".
- Spot D = 2 d tan(beam/2). On a slanted surface the long axis is D / cos(incidence), the small-beam approximation the owner named; when incidence plus half the beam reaches 90 degrees the cone's edge never lands and no ellipse is claimed.
- Lux at the centre E = I cos(incidence) / d^2, the inverse-square and cosine laws (the point-by-point method of any lighting handbook, e.g. the IES Lighting Handbook). I = lux x at_m^2 from the type's `optics` in `src/rigbuild/types/moxir.json`, scaled by flux when the class uses another angle than `optics.beam_deg` (the 250BSW, used at 15 of its 10-30). No lux in the optics: the row says "no figure".

### What is borrowed, plainly

- Every UP-* beam angle and candela in these tables is borrowed from another maker's product. None of the types the ground versions use has an EXACT photometry basis, so every lit row carries `borrowed` (273 of 273 in minimal-ground, 290 of 290 in full-ground): B380F from a SHEHDS GalaxyJet claim (1.8 deg, 125,500 lux at 20 m, "maker's claim, not an independent measurement"), 250BSW from a Chauvet 475ZX (13 deg, used at 15), HK1915 from a Liro L1915Z (4 deg), PL5403 from a Colorful 54 x 3 PAR, the laser from a Bluesea sheet (no candela), the COB ASSUMED (no lux figure exists).
- The beam angle is taken as the full angle to 50 % of peak, the usual convention; the borrowed sources do not say which they mean.

### What it is not

- Direct illumination only: no bounce off walls and roof, no haze scattering. The room's beams-in-haze look is a rendering effect, not a lux figure.
- The numbers are NOT seen on a screen and NOT compared with a light meter. Lux at level assumes linear dimming.
- The footprint is where the AXIS lands. A PAR whose axis runs beside a column (the eight `par-columns-8`, "up the column") reads "open air" although its cone does graze the column face as a stripe; the cone-against-surface outline is owed. Of the 52 open-air rows in each version, those are the column PARs and the six header PARs (12 m reach, beams cross above the DJ and end in the air).
- Columns are boxes from the hall's column grid (0.8 x 0.5 m to 6.56 m); the head's flare, hoists, chains and struts are not modelled. Flat-roof (v2) halls only: a pitched-roof hall makes the script stop with a message.

### Findings from the run (to look at, not conclusions)

- B380F: a 1.8 deg shaft from the floor throws 12.8 m to the roof deck: a 0.40 m spot at about 302,000 lux (50.2 million candela from the borrowed figure). That is an order of magnitude above the round number in the owner's brief; it is only as good as the borrowed figure.
- The scenes that lean the column beams OUT (slow-sweep and gs-slow-fan, 24 degrees): the six column B380F throw 1.4-1.5 m onto their own columns, a 0.04 m spot at 7.4-7.9 million lux, and the six 250BSW hit the columns at 3.9-5.5 m. The room draws these beams through the column (`surfaceHit` knows no columns); real steel would stop them. Worth re-aiming inward.
- PAR: the type file gives 11,000 cd (its `beam_deg` 15); the room draws 30,478 cd (the manifest assumes the 11,000 lux at 25 deg and scales by flux to 15). The two files disagree; 84 rows in minimal-ground carry `room-differs`. The tables use the type file (the owner's formula); the CSV has `I_room_cd` beside it. One decision is owed.
- No figure: the COB blinders and the two lasers (24 lit rows). The blinder's brightness on the DJ cannot be stated until a maker or measured figure exists.
- dim: none (the lowest lit figure is about 26 lux, a crane PAR at 35 % in gs-roof-reveal). wide: 17 rows (7 COB in slow-sweep, 6 250BSW in gs-cross-beams, one crane PAR in each of four looks). tight: 89 rows, all B380F.

### The scenes in words (minimal-ground; full-ground is in its own file and adds gs-haze-wall and gs-spark-hit)

- white-cathedral: the 7 backstage B380F throw 1.8 deg shafts 12.8-12.9 m: a 0.4 m spot at about 302,000 lux, a hard white disc on the roof deck; the 6 column B380F do the same at 12.9 m; the 4 bee-eyes (60 %) put a 0.9 m spot at 1,212 lux up there; the six header PARs end in open air. All the lit spots together are about 4 m2.
- red-room: the four crane PARs graze the girders' underside at 5.7-6.7 m (1.5-1.8 m spots at 76-291 lux), the three press PARs light the press at 2.2 m (0.6 m at 329 lux), the backstage B380F (45 %) still put 0.4 m discs at 136,765 lux on the roof, the six 250BSW (25 %) 3.4 m spots at 404 lux; about 86 m2 lit.
- strobe-hit: seven COB blinders, three on the floor (4.0-5.5 m throw, 3.3-4.6 m spots) and four on the DJ riser (3.2-3.8 m, 2.7-3.2 m spots): about 66 m2 lit and no lux figure to give.
- one-beam: one B380F shaft to the roof (0.4 m at 303,922 lux) and one COB on the riser (2.9 m, no figure).
- slow-sweep: the backstage B380F at 12.9-13.0 m (about 300,000 lux), but the six column B380F lean into their own columns 1.5 m away (0.04 m at 7.9 million lux) and the 250BSW hit the columns at 5.5 m; the COB wash is 155 m2 lit in all, seven spots flagged wide.
- gs-one-shaft: one B380F, 12.8 m to the roof: a 0.4 m spot at 303,922 lux; the whole lit area is about 0.1 m2, nothing else in the room but haze.
- gs-columns-below: the eight column PARs (55 %) read open air by the axis, so the glow on the column faces is NOT computed here (owed); the six 250BSW (30 %) throw 13.0 m to the roof: 3.4 m spots at 485 lux.
- gs-roof-reveal: the backstage B380F (90 %) at 12.8-12.9 m, 0.4 m at 267,000-274,000 lux; the six column B380F (70 %) at 12.8 m, 0.4 m at 212,745 lux; the crane PARs (35 %) 27-102 lux on the girders.
- gs-slow-fan: the backstage B380F (80 %) fan at 12.9-13.5 m, 0.4 m at 211,000-242,000 lux; the six column B380F (70 %) lean out into their columns: 1.4 m, a 0.04 m spot at 7.35 million lux; the 250BSW (40 %) hit the columns at 3.9 m, a 1.0 m spot at 1,723 lux.
- gs-cross-beams: the column B380F (85 %) cross to the roof at 22.4 m: 0.7 m spots at 63,125 lux; the 250BSW (50 %) at 21.4 m make 5.6 m spots at 228 lux (long axes over 6 m, flagged wide); about 204 m2 lit, the widest scene.
- gs-red-room: crane PARs 34-131 lux, press PARs 198 lux, the backstage B380F (40 %) 121,569 lux, the 250BSW 3.4 m at 404 lux; about 86 m2.
- gs-white-cathedral: the column B380F (90 %) at 12.8 m give 273,530 lux, the backstage ones (70 %) 211,000-213,000 lux, the 250BSW 3.4 m at 970 lux, the press PARs 132 lux; about 87 m2.
- gs-blinder-hit: the same seven COB footprints as strobe-hit, 66 m2 of spots and no lux figure.
- gs-laser-roof: one B380F (35 %) at 12.8 m, 106,373 lux; two lasers (60 %) reach the roof at 29.6-31.1 m; no lux figure, and the 0.6-0.7 m "spot" is the room's 1.2 deg drawing clamp, not the laser's millimetre beam. Nothing here is a laser-safety statement.

### Validation

- `npx vitest run scripts/rigbuild/footprints.test.js`: 18 of 18 pass. They hold the owner's known geometry (a lamp 10 m over the floor, 20 deg, straight down: 3.53 m; lux = I / d^2; the 60 deg incidence cosine halves the lux and doubles the ellipse; grazing gives no ellipse), open air (a reach of 9.9 m against 10.1 m), each surface class (wall, roof deck, lantern top, lantern side, press, column, a rotated box), the basis flag (EQUIVALENT, ASSUMED and a missing basis are flagged, EXACT is not), "no figure", the wide/tight/dim thresholds, and on both real ground versions: a row per lamp per look, a deterministic CSV, the throw within 0.11 m of rig-lib's `surfaceHit` on floor, roof, wall and machine hits (and never longer than it), the B380F lux equal to 125,500 x 20^2 / throw^2 x cosine within 1 %, the COB with no figure, and gs-one-shaft with exactly one lit lamp.
- `npx eslint` on the two touched code files: clean. Nothing else was run (a browser, rendering and the wider suite were out of the brief).

### Owed

- The cone-against-surface outline (stripes on grazed columns, the true ellipse) instead of the axis spot.
- One decision on the PAR's photometry (15 or 25 deg for the 11,000 lux), and a maker or measured figure for each UP-* type (the rental unit's report) to move any row off `borrowed`.
- A real look: the numbers here are not seen on a screen and not against a light meter.
