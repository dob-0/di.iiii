## 2026-09-29 — MOXIR hall: the crane measured, the 09-29 layer

Branch `feat/moxir-hall-0929` (worktree `~/work/di.iiii-hall-0929`, from dev 37ca97b2).
Input: 12 FUJIFILM X-T5 photos the owner sent through di.bo on 09-29 (shot 2026-09-26
15:45–16:23 +04, no GPS) in `/mnt/data/footage/moxir-2026-10-17/incoming-2026-09-29/2026-09-29/`
with `photos-2026-09-29.json` (photo_meta.py: EXIF, 35 mm-eq focal, NOAA sun) beside them,
plus the older photo 007. The photos are the owner's and stay private: the repo holds only
numbers read off them.

- **Crane heights, measured** — `scripts/place/crane_height.py` (new): single-view metrology
  (Criminisi, Reid & Zisserman, IJCV 2000) on photo 007 (iPhone 3x tele from the entry crane,
  looking at the far crane and the end wall). The crane's own rail span (GOST 534-78:
  24 m − 2λ = 22–23 m) sets its depth; the floor at the end wall is the reference; the horizon
  cancels; Monte Carlo over focal, camera place/height, wall place, span and ±6 px readings.
  Pixel readings with how they were read: `rigs/moxir-crane-picks-2026-09-29.json`.
  Rail top 8.08 m (5–95 % 7.81–8.36; was 7.6 disputed 6.6–8.4), bridge underside 7.96 m
  (7.69–8.24), girders 0.77 m deep (was 1.5 GUESS), cab bottom 5.85 m, the far crane's hook
  as parked 3.73 m, far crane 76.2 m from the entry grid line (was 95 GUESS). Scale check in
  the same photo: the end wall's steel double door reads 2.01 × 2.39 m. Only the FAR crane is
  measured; the DJ (entry) crane is ASSUMED identical.
- **Overlays** (history kept, nothing earlier edited): `moxir-hall-dims-2026-09-29.json`,
  `moxir-hall-features-2026-09-29.json`, `moxir-hall-crane-dj-2026-09-29.json`; every value
  has value/range/confidence/how/source.
- **hall.py**: `crane_bridge_bottom_h_m`, `crane_bridge_depth_m`, `crane_cab_h_m` are dims
  (default = the v2 assumption, so older overlays build the same hall); a `{value, confidence,
  range}` entry keeps its confidence and range in hall.json; a GOST 100 mm crane-to-roof check;
  `--preview-camera` takes an image size; the preview prints which GPU drew it.
- **Outputs**: `/mnt/data/footage/place-moxir-hall-v4-0929/` (as seen) and
  `…-v4-0929-crane-dj/` (hall.glb, hall-show.glb, hall-night.glb); fixtures
  `rigs/moxir-hall-2026-09-29.hall.json`, `…-crane-dj.hall.json`.
- **Rig effect** (minimal rig built on the old vs new crane-dj hall): truss trim 6 m unchanged;
  hoists/spreaders 0.2 m lower, chains 1.26 → 1.06 m; column PAR and bridge PAR aims shift
  slightly. The rig files still name the 09-28 hall and "rail 7.6 / girder bottom 8.15" —
  theirs to update (peers own them).
- **Dropped**: every object placed from a VGGT/bearing pose — red blower, blue fan housing,
  fallen lattice (858/867) and the backstage machine tool, its fan head and a block pallet (856):
  each photo-match render put it visibly wrong (856: the machine fronto-parallel and ~2x too
  close; it runs diagonally away in the photo). Listed under seen_not_modelled. The 858/867
  bearing fits and the 856 VGGT pose are rejected as viewpoints.
- **Owed**: one tape/laser distance to a crane's underside on site; the DJ crane's own
  underside and hook; a full PnP with identified columns for the 09-26 photos; the roller
  conveyor seen in 865/866 may sit at the dance floor's left edge — verify on site.
- Guards: `scripts/place/hall-crane.test.js` (6 tests).
