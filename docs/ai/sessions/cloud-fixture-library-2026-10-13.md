## 2026-10-13 — one fixture library with provenance; one laser list; a room loads only the types it uses

Cloud routine, owner's decision 4 (`docs/ai/decisions/2026-10-13-views-library-words-workflow.md`) and plan rows C1–C2 +
finding 4 of the MOXIR-tools inventory (PR #901, `docs/ai/plans/2026-10-13-moxir-tools-into-di-iiii.md`, not on this base).

- **Safety gap closed, first and on its own commit.** Three hand lists named the lasers (`shared/laserMoments.cjs`: both;
  `sceneDeck/model.js`: `up-la40wf` only; `laserView.js`: the LaserCube only). A laser a project carries in
  `rentalList.types` was refused on the show page only if its group NAME said "laser". Now ONE list, `LASER_TYPES` (with
  `drive: dmx|frames`) in `shared/laserMoments.cjs`, browser twin `src/shared/laserTypes.js` (twin test);
  `laserTypeIdsOf(document)` adds the project's own `category: laser` types. Show page (`showCuesOf`), scene deck
  (`guardSceneChange`) and laser view (`FRAME_LASER_TYPES`) read it. Tests seen red on the old code: showRemote 1, sceneDeck 2.
  known-fixes row added.
- **Consequence to know:** the scene deck now sees the LaserCubes. RIG_BUILD §24 had parked this as the owner's call ("would
  refuse every edit of v1.0's four laser looks"); this routine's brief asked for one list, so it is done. A deck edit of a scene
  that lights a LaserCube without `requiresLaserSignOff` is now refused. How many live v1.0 looks this touches: UNVERIFIED (they
  live in the space database, not the repo).
- **One library.** `src/rigbuild/types/library/` — `index.json` (order, code, category) + one generated `<id>.json` per type,
  from the same manifest (`scripts/rigbuild/types.mjs`). Each type has `provenance`: `identified` (exact|equivalent), `date`,
  `sources`, and `values` counted by how each was got (measured / tested / datasheet / equivalent / assumed / unknown), read from
  the manifest's own `basis`. Today: measured 0 on every type (the manifest says so); tested >0 on B380F, PL5403, LA40WF (the Sevan
  channel maps). The rule for adding a type is in the library's README. `types/moxir.json` stays as a generated alias; a test
  fails if code here reads it again (three dated MOXIR Python generators allowed).
- **Loading.** `types/projectTypes.js` `useProjectLibrary`: the room (`RigBodies`, `useRigLookEntities`) and the viewer
  (`RoomRigSteps`, `RoomLookFollower`) load one chunk per type the document names. The Studio work tools keep the whole library.
- **Measured** (`npm run build`, Vite 8.3.3; gzip = `gzip -c | wc -c`):
  before, every rig room preloaded `types-*.js` 52,192 B / 13,370 B gzip (13 types);
  after, a 3-type room (B380F, PL5403, hazer) loads `projectTypes` 3,542 + 3 type chunks 18,561 = 22,103 B / 9,433 B gzip.
  Unit test (`projectTypes.test.js`, source JSON): 13 types 87,048 B → 3 types 28,878 B (33 %).
  **Cost:** the Studio work tools now fetch 14 chunks, 62,791 B / 29,074 B gzip (was 1 chunk 13,370 B gzip): per-file gzip
  loses the shared dictionary, and provenance adds about 6 kB raw. A room hanging all 13 types pays the same.
- **Tests** (`npx vitest run`, whole suite): before 10,418 passed / 4 failed / 58 skipped (927 files); after 10,434 passed /
  4 failed / 57 skipped (929 files). The 4 failures are the same on both, `scripts/di/oneAddressPrinted.test.js` (this container;
  not touched here). New/changed: showRemote +1, sceneDeck +2, laserTypes 5 (new), laserView +1, fixtureTypes +2, projectTypes 4 (new).
- UNVERIFIED: no real browser (desktop or phone) opened a rig room on this branch; the measurement is of built chunks, not of a
  page's network log. The 57 vs 58 skipped was not chased.
- **Next:** open a rig room on the dev tier with `verify:surfaces` and read its network log (expect 3–6 type chunks, not one
  library chunk); decide whether the Studio tools should load one bundled chunk instead of 14 (a second generated
  `all.json` would undo the 2× gzip cost); delete `types/moxir.json` once no open branch reads it; the plan's C2 rest (plot
  symbols, wash level, blinders from the same capability table).
