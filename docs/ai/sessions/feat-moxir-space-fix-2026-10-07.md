# feat/moxir-space-fix-2026-10-07 — MOXIR step 1: the space

The owner's order for MOXIR (17 Oct): "first fix the space, then the stage, the crane place and the truss, then the
lights". This branch is step 1, the hall model only. The rig is not touched.

Built on `feat/moxir-truss-flip-2026-10-07` (cc8b8896, Emilya's #772 crane merge) with
`feat/moxir-aerial-2026-10-07` and `feat/moxir-photo-analysis-2026-10-07` merged in.

## What changed

- `scripts/place/hall.py`: a new dims key `end_wall_in_from_grid_m`, the end walls' inner face out from the end grid
  line. Its default 0.5 is the old hard-coded value, so every earlier layer chain builds the same geometry. End
  columns are clipped flush with the wall's outer face and the runway girders end at its inner face; both are no-ops
  at the default. `hall.json` geometry gains `end_wall_outer_y_m` and `outer_length_m`.
- `scripts/place/rigs/moxir-hall-dims-2026-10-07.json`, layered last. Each value has source, method, ± and date:
  - lantern segments ±6.0 … ±46.9 m from the joint (were ±7.25 … ±45.75): aerial, ±0.8;
  - `end_wall_in_from_grid_m` −0.2 (was 0.5): outer faces ±54.1, length 108.2 (was 109.6): aerial roof 108.2 ± 0.6;
  - crane girder underside 7.95 restated per crane. The far crane was measured by photo 007; the near crane is
    `assumed_for_near_crane`. The value is unchanged from the 10-02 layer;
  - `held`: span, pitch, bays, width, lantern width/spans/height, the columns (photo 032), the joint pair 1.2 vs 1.0;
  - `suspected`: the solar roof since 2024 may block lantern daylight; the model still draws the lanterns open.
- `moxir-hall-features-2026-10-07-photos.json` is NOT in the `--dims` chain. hall.py reads none of its keys (floor
  polygons, column checks, zone suggestions).
- `scripts/place/rigs/moxir-hall-2026-10-07.hall.json`: the v5 build record. `scripts/place/hall-aerial.test.js` checks it.

## Build

```
blender -b -P scripts/place/hall.py -- --out /mnt/data/footage/place-moxir-hall-v5-2026-10-07 \
  --dims scripts/place/rigs/moxir-hall-dims-2026-09-28.json --dims scripts/place/rigs/moxir-hall-features-2026-09-28.json \
  --dims scripts/place/rigs/moxir-hall-crane-dj-2026-09-28.json --dims scripts/place/rigs/moxir-hall-dims-2026-10-02.json \
  --dims scripts/place/rigs/moxir-hall-dims-2026-10-07.json
```

The build ran under `flock ~/.local/state/di/locks/browser.lock` with no `--preview`. The package was at 56 °C before
the run and 81 °C after it. Result: 97.4 × 108.2 m, 55 488 triangles, 3 656 frame members.
hall.glb sha256 `b9037692bdae33e3bd1132801bc686ca03ada1cd86646eb8f30f9b388fe5733f`.

## Diff against moxir-hall-2026-10-02-crane-dj.hall.json (every changed number)

| key | 10-02 | 10-07 |
|---|---|---|
| dims.lantern_segments_m | [[-45.75,-7.25],[7.25,45.75]] | [[-46.9,-6.0],[6.0,46.9]] |
| dims.end_wall_in_from_grid_m | (hard-coded 0.5) | -0.2 |
| geometry.end_wall_inner_y_m | 54.5 | 53.8 |
| geometry.end_wall_outer_y_m (new) | (54.8) | 54.1 |
| geometry.outer_length_m (new) | (109.6) | 108.2 |
| geometry.door.z_m | 54.5 | 53.8 |
| geometry.far_gate.z_m / far_wall_z_m | -54.5 | -53.8 |
| geometry.lanterns[0..3].z_m | ±[7.25, 45.75] | ±[6.0, 46.9] |
| geometry.space_frame.members | 3560 | 3656 |
| triangles | 54624 | 55488 |
| meshes.hall-frame / hall-steel | 40948 / 4368 | 41716 / 4464 |

The 10-07 record also writes the crane keys that hall.py has read since 10-07 (`crane_girder_inner_gap_m` 1.5,
`crane_girder_w_m` 0.7, `crane_cab_inset_m` 1.0, `crane_cab_w_m` 2.0). These are the defaults and equal the old
hard-coded values. It also writes `girder_bottom_basis` on each crane as text. Unchanged: the grid
(`column_grid_z_m`), rows, every crane number (girder underside 7.95, rail 8.1, depth 0.8, cab 2.1), heights,
walls across, and massing.

## The rig against the new hall

- The versions spec was pointed at the new hall in the working tree only, then reverted. `node
  scripts/rigbuild/versions.mjs` rewrote the 12 version rig files, and the only line that changed in each was the
  hall path. Truss, picks, tie-offs and bridles are byte-identical. Known · full is unchanged.
- Every 3-number point in the 13 version rig files was checked against both halls: tie-off/cab clashes, points in a
  lantern, and points past an end wall. The result is the same for both halls in all 13 files.
- `npx vitest run scripts/rigbuild scripts/place scripts/production`: 50 files and 923 tests passed. The new
  `hall-aerial.test.js` adds 5 more, which also pass.

## Shown (scratch only)

The scratch stack `moxir-flip` (web :5335, api :4323) holds project `moxir-known-full-flip`.

- The document was saved first, in the session scratchpad: `moxir-known-full-flip.before.json` (sha256 095b21cf…,
  version 3). The old GLB was saved as `hall-df837baa-before.glb`.
- `swap-hall.mjs` changed the hall from df837baa… to b9037692…, version 5.
- The read-back shows that only `place-hall` changed out of 127 entities, and its asset is the new GLB.
- Nothing was written to dev.diiii.xyz or local.thedi.studio, and no headless WebGL screenshots were taken.

## Owed

- The owner's look at http://moxir-flip.dii.localhost/moxir: the scene, from the floor and toward the ends.
- The tape on 10-08 (`moxir-hall-measured-2026-10-08.json`):
  - the end walls per end (aerial: entry 53.3 ± 0.5 and far 54.9 ± 0.6 from the joint; the model keeps them
    symmetric);
  - the end columns' binding (whether they sit 0.5 m in from the end grid line);
  - the near crane's girder underside;
  - photos straight up at x +12 and z 0 (solar roof and lattice band).
- Carry the v5 hall into the live Known · full (local, then dev), as ops on a followed space. This is not done here.
- `realism.mjs` was not run on the scratch project. swap-hall's header says the night copy of the hall is made from
  the model.
