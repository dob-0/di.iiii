# feat/moxir-stage-line-2026-10-07 — MOXIR step 2: the stage on the owner's line, the crane place, the truss

The owner's order: stage → crane place → truss → lights. This branch does the first three on a **scratch copy only**
(stack `moxir-flip`, serverXR 127.0.0.1:4323). Nothing was written to dev.diiii.xyz or the installed di. Lights are
not redesigned: what hangs on the truss moves with it, and every floor fixture stays where it was.

Built on `feat/moxir-space-fix-2026-10-07` at 6ba77270 (hall v7-show: the prefab cabin moved out, owner 2026-10-07).

## What the owner decided (2026-10-07)

He drew on video frame 954 @ 3.6 s: a stage line across the floor at the front of the white bags, the DJ behind it,
speakers L and R on it, and the audience everything in front. The marks were projected with
`scripts/place/picks/cam-954-3.6.json` by `scripts/place/project_floor_marks.py`, giving
`scripts/place/picks/marks-954-stage-2026-10-07.json`. The design that follows from them, with sources and accuracy, is
in `scripts/place/rigs/moxir-stage-line-2026-10-07.json`:

- the stage line is drawn square at z 24.5 (±2.5 m from the camera height);
- the booth is centred at x 2.445, as drawn;
- PA L is centred at x −1.8 and PA R at x 6.05;
- the barrier is at z 25.8;
- the crane is parked at z 24.

## Files

| file | what |
|---|---|
| `scripts/place/rigs/moxir-hall-stage-line-2026-10-07.json` | dims layer, last in the chain: near crane `cranes_from_door_m` 30.0 (z 24), dance zone z 25.8–48, stage zone |
| `scripts/place/rigs/moxir-hall-2026-10-07-v7-show-stage24.hall.json` | build record. Its geometry is identical to v7-show except `cranes` and `zones` |
| `scripts/place/rigs/moxir-crane-cut-stage-line-2026-10-07.json` | the 09-29 cut, unchanged, except the tie-off texts and the house-right anchor at 4.7 m |
| `scripts/rigbuild/stage-line.mjs` (+ test, 19 tests) | `parkOptions`, `stageLineRig` (craneCut at the line), `stageLineOps` (the copy moved as ops) |
| `scripts/place/rig-lib.mjs` | `stageFrame`: booth `front_z_m` and `truss_axis_x_m` (both are no-ops when absent; `versions.mjs --check` is unchanged) |
| `scripts/place/stage_line_pictures.py` | plan, section and frame-954 pictures, drawn from the records and the copy's document |

Hall build: `blender -b -P scripts/place/hall.py -- --out /mnt/data/footage/place-moxir-hall-v7-show-stage24-2026-10-07`
with the v7-show chain plus `--dims scripts/place/rigs/moxir-hall-stage-line-2026-10-07.json` last. It ran under the
browser lock with no preview, at 56–61 °C. hall.glb sha256 `35eb68c0…`.

## Scratch build (in order)

1. `copy-version.mjs --from moxir-known-full-flip --to moxir-known-full-stage24 --suffix stage24 --label "stage line 10-07" --siblings <file>`.
   This gave 127 entities, and the source was only read.
2. `swap-hall.mjs --project moxir-known-full-stage24 --glb <v7-show-stage24 hall.glb>` reported "listed".
3. `stage-line.mjs --project moxir-known-full-stage24 --apply`: 88 ops, read back clean, 131 entities.
4. After the stage-zone fix and the hall rebuild: `swap-hall.mjs` again ("listed"), then `stage-line.mjs --apply` again,
   which re-derived the venue plan only.

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
