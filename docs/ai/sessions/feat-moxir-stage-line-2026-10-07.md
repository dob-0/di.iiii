# feat/moxir-stage-line-2026-10-07 — MOXIR step 2: the stage on the owner's line, the crane place, the truss

The owner's order: stage → crane place → truss → lights. This branch does the first three on a **scratch copy only**
(stack `moxir-flip`, serverXR 127.0.0.1:4323). Nothing was written to dev.diiii.xyz or the installed di. Lights are
not redesigned: what hangs on the truss moves with it, and every floor fixture stays where it was.

Built on `feat/moxir-space-fix-2026-10-07` at bea825f8 (hall v8-show: the prefab cabin moved out, and the roller conveyor the owner marked beside the bags).

## What the owner decided (2026-10-07)

He drew on video frame 954 @ 3.6 s: a stage line across the floor at the front of the white bags, the DJ behind it,
speakers L and R on it, and the audience everything in front. The marks were projected with
`scripts/place/picks/cam-954-3.6.json` by `scripts/place/project_floor_marks.py`, giving
`scripts/place/picks/marks-954-stage-2026-10-07.json`. The design that follows from them, with sources and accuracy, is
in `scripts/place/rigs/moxir-stage-line-2026-10-07.json`:

- the stage line is drawn square at z 24.5 (±2.5 m from the camera height);
- the booth: drawn at x 0.84–4.05 (centre 2.445). It is placed at centre **x 2.0**, moved 0.445 m toward house left so it clears the fixed roller conveyor (x 3.6–4.6, z 16.5–24.0, hall v8) by 0.1 m. As drawn, it overlapped the conveyor by 0.345 m. **This is a question for the owner**; the design file's `booth.moved` records it. PA R stands 0.78 m clear of the conveyor and did not move;
- PA L is centred at x −1.8 and PA R at x 6.05;
- the barrier is at z 25.8;
- the crane is parked at z 24.

## Files

| file | what |
|---|---|
| `scripts/place/rigs/moxir-hall-stage-line-2026-10-07.json` | dims layer, last in the chain: near crane `cranes_from_door_m` 30.0 (z 24), dance zone z 25.8–48, stage zone |
| `scripts/place/rigs/moxir-hall-2026-10-07-v8-show-stage24.hall.json` | build record. Its geometry is identical to v8-show except `cranes` and `zones` |
| `scripts/place/rigs/moxir-crane-cut-stage-line-2026-10-07.json` | the 09-29 cut, unchanged, except the tie-off texts and the house-right anchor at 4.7 m |
| `scripts/rigbuild/stage-line.mjs` (+ test, 22 tests) | `parkOptions`, `stageLineRig` (craneCut at the line), `stageLineOps` (the copy moved as ops), `riserClearance` |
| `scripts/place/rig-lib.mjs` | `stageFrame`: booth `front_z_m` and `truss_axis_x_m` (both are no-ops when absent; `versions.mjs --check` is unchanged) |
| `scripts/place/stage_line_pictures.py` | plan, section and frame-954 pictures, drawn from the records and the copy's document |

Hall build: `blender -b -P scripts/place/hall.py -- --out /mnt/data/footage/place-moxir-hall-v8-show-stage24-2026-10-07`
with the v8-show chain plus `--dims scripts/place/rigs/moxir-hall-stage-line-2026-10-07.json` last. It ran under the
browser lock with no preview, at 55–61 °C. hall.glb sha256 `c1de61ce…`.

## Scratch build (in order)

1. `copy-version.mjs --from moxir-known-full-flip --to moxir-known-full-stage24 --suffix stage24 --label "stage line 10-07" --siblings <file>`.
   This gave 127 entities, and the source was only read.
2. `swap-hall.mjs --project moxir-known-full-stage24 --glb <v7-show-stage24 hall.glb>` reported "listed".
3. `stage-line.mjs --project moxir-known-full-stage24 --apply`: 88 ops, read back clean, 131 entities.
4. After the stage-zone fix (v7-show build), and again for hall v8-show with the conveyor: `swap-hall.mjs`
   ("listed"), then `stage-line.mjs --apply`. That re-run moved only the booth (Δx −0.445) and re-derived the venue plan.
   The copy ended at version 110, on hall `c1de61ce`.

The reference `moxir-known-full-flip` is untouched: version 9, hall v6 `4e3420f4`.

## Findings

- **The reference copy (PONYO 10-04) hangs the cut 0.2 m higher than git derives.** Its clamps sit at 8.0 m, inside
  the 7.95 m girder of its own hall model: it was built on the old 8.15 m girder guess, before #772.
  - `stageLineOps` moves the cut rigidly by the offset its re-derived rigging gives, (0, −0.2, 19.2). The copy
    therefore matches git's Known · full: ends 3.24 / 6.35 m, bridles 26/42/119°.
  - The live Known · full rooms probably carry the same 0.2 m. Check them before the show.
- **swap-hall leaves the venue plan stale.** The reference's plan still says crane bottom 8.15 and the 10-02 lanterns.
  `stage-line.mjs` re-derives the plan for the copy with `venuePlanFromHall`.
- **The looks' `backdrop` rules follow the riser.** In the copy, `lookFrame` now finds the blower, canopy and duct
  group (face z 22) as the backdrop, not the press.
  - A look played on this copy would aim the press PARs (`backdrop` rule) at z 22.
  - Fix this in the lights step: pin the backdrop to the press.

## Owed

- Tape on 10-08:
  - the near crane's girder underside (7.95 is ASSUMED) and the cab bottom (5.85);
  - the pipe racks' heights at the z 24 column (the house-right anchor window is 4.60–4.8 m);
  - the crane's travel from z 4.8 to 24 along the runway: its brakes, rated load and lock-out.
- Sound: the PA stacks are placeholders (L-Acoustics KS28 ×2 + KARA II ×3 a side). The count and coverage come from the
  rental house's prediction.
- Crowd safety: the barrier line (11.19 m, 1.3 m pit) is to be set by the event's crowd-safety plan.
- The owner's look at http://moxir-flip.dii.localhost/moxir/p/moxir-known-full-stage24.

## Owner direction, later on 10-07: "keep max dj center … just one step thing"

- **Booth**
  - On the nave axis: x 0 under the cut's axis, front on the line z 24.5, 2.1 m clear of the conveyor.
  - One 0.2 m step instead of the 1.2 m riser: 3 × StageDex Topline 2 × 1 m on SM-L-20A legs, kept as one 3 × 2 m level.
    A single 2 × 1 m deck would leave 0.2 m behind the table, so the 3 × 2 m level is kept (owner to confirm).
  - The 0.20 m height is assumed from the leg's code.
  - The stair is deleted; the table stays 0.95 m high on the step.
- **PA**
  - Symmetric at ±5.4 m: the smallest symmetric spacing outside the conveyor (4.6 + 0.1 + 0.67), 0.13 m clear.
  - At his ~±3.9 m the right stack would stand on the conveyor. **This is a question for the owner.**
  - The ±1 m uncertainty in the conveyor's x is bigger than that 0.13 m clearance: tape it.
- **Crowd sightline** (`crowdSightline`, the C-value on a level floor): with the step, the front row gets C 45 mm, so on
  a level floor nobody gets even the 60 mm minimum.

  | riser | C 60 mm | C 90 mm |
  |---|---|---|
  | 0.2 m | 0 rows | 0 rows |
  | 0.6 m | 6 rows | 2 rows |
  | 1.2 m | 16 rows | 9 rows |

  The DJ's eye line passes 0.07 m over the front row's heads (0.96 m on the old riser). The cut still leaves the front
  row 2.29 m of clear view to the DJ. This is a trade-off for the owner, not decided here.
- **Crane z 24 is unchanged.** The 1 m DJ rule reads the riser's depth, not its height; a test holds that.
- **Views:** `scripts/rigbuild/aim-views.mjs` derives the entry camera and the Floor / DJ buttons from the design's
  `views` block and writes them in one `setPresentationState` op.
- **Conflict guard:** `stage-line.mjs --last <doc>` and `aim-views.mjs --last <doc>` keep and list anything someone else
  moved since the script's last write. Ops only, never a whole-document write.

### The owner edited the copy by hand (kept, never written over)

His edits, from the op log (two editor clients):

- **PA L:** subs −1.8 → −3.08 → **−5.18**, tops → −5.22.
- **PA R:** subs 6.05 → **5.49**, tops → 5.44.
- **Stair treads:** he deleted all six (v115–v120). That matches the design.
- **Booth:** nudged to centre x **0.128**, z −0.01 (decks −0.872 / 0.128 / 1.128, table 0.128).
- **Barrier:** z 25.79.

The copy ended at version 164.

**Guard incident.** One run used a `--last` document that already held his booth and barrier nudges. The run put
those five entities back (v154–158). I restored his exact transforms (v160–164) and read them back.

The guard now reads the **op log** (`theirsFromOps`): any entity a non-script client ever touched is kept. It refuses
to write when the log does not reach version 1, and the server keeps a 500-op window. `aim-views.mjs` refuses to write
the views if someone else set them.

### The owner's answers (later on 10-07), applied to scratch by ops

1. **DJ step = 0.4 m ("two decks low"), still one step up.**
   - Hardware: StageDex SM-L-40A legs, a 37.5 cm leg (bax-shop listing). With the 175 mm SM-L-20A, the codes name the
     stage height and the leg is 25 mm shorter. The maker's height table is still not opened.
   - His booth place is kept (centre x 0.128). Only the step's height and the table's height changed: `stageLineOps`
     height-only for a booth someone else placed.
   - Crowd at 0.4 m: front row C 80 mm, 2 rows over 60 mm, 0 over 90 mm. The DJ's eye passes 0.25 m over the front
     row's heads.
   - At z 24 the cut leaves the front row 2.14 m of clear view to the DJ, and 1.96 m over the DJ's raised hands. The
     crane stays at z 24; the park table is unchanged.
2. **PA = symmetric ±5.4 m**, the owner's choice over his hand placement.
   - Recorded as `pa.decision` in the design file.
   - Written with `stage-line.mjs --take <ids>`: the guard lets go of exactly those ids.

**Views re-aimed:** the DJ eye is 2.05, the Floor target is the DJ's head at 2.15, and the entry target is at 5.05.
The copy is at version 176. Ops 165–176 all came from the scripts; no owner edit happened in that window.

## Picture gate, later on 10-07: "the truss at the back of the DJ … with the truss flipped"

This is a scratch copy only: `moxir-known-full-stage-back-flip`, copied from stage24 at v176. stage24 itself is
unchanged.

- **New park rule for a backdrop** (`truss_behind_m` in rig-lib `stageFrame`): every hung part stands a clear gap
  (0.5 m, a design choice) behind the riser's back edge. The front-most hung parts are the bridle clamps on the front
  girder, 0.82 m from the bridge's plane.
  - `behindOptions` compares the park: z 21.0 gives 0.68 m, so it passes and is picked. z 21.18 gives exactly 0.50.
    z 21.5 gives 0.18, which fails. At z 22.0 the clamps hang 0.32 m over the step.
- **Flipped cut:** `moxir-crane-cut-back-flip-2026-10-07.json` is the stage-line cut mirrored, re-derived by craneCut.
  - The ends are LOW 3.24 house right and HIGH 6.35 house left. Bridles are 119/42/26°, mirrored. Trim and loads are
    mirrored too, and a test holds it.
- **Tie-offs:** both go to the z 18 columns, 26–28° off the plane, so they draw the line back, away from the DJ.
  - HL ties level at 6.50 m, 0.56 m under the runway.
  - HR, the LOW end, cannot tie at its own 3.39 m: it runs into the pipe racks, and below them into the drum tank or
    the canopy. The least change is +1.71 m to **5.10 m**, rising 15°, 0.11 m over pipe-rack-3.
  - The low end is 0.74 m over raised hands, and 0.70 m from the blower cyclone.
- **For comparison, the un-flipped cut at z 21** passes with no change. HL ties at 3.39 m and HR at 4.70 m (0.20 m over
  pipe-rack-3).
- **Copy:** `recutOps` moves the 53 cut entities mirrored, then 3 m back. That is rigid, refused otherwise, and the
  safety steels are re-derived. The views are re-aimed (`aim-views --design`); the entry camera now targets z 21.
- **copy-version trap:** the version id is capped at 48 characters, so `stage24-backflip` was refused. The suffix is
  `b`. A `--id` option is owed.
- **Pictures:** `back-flip-compare.png` (three sections), `back-flip-plan.png`, `back-flip-on-frame-954.png` and
  `back-flip-side.png`.
