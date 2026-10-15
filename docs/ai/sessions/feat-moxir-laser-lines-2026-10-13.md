## 2026-10-13 — MOXIR lasers drawn as real laser lines (line sources from the maker's diodes), the laser scenes green

- Owner (17:2x): "make lasers too like real lasers - there are not lasers" (ledger N559). moxir-v2-9's 38 laser beams carried no
  `beam.laser`, so the room drew each as a narrow white spot cone; the line renderer (laserLine.js, SpotLightObject LaserLines) was
  never used for them.
- `scripts/rigbuild/epic-build.mjs`: every laser beam gets `beam.laser` (`laserComponentOf`): its share of the unit's diodes in mW
  (`laserBeamShare`: duty x room share / lines on, the one split `laserBeamLumens` now uses), nm 455/525/638, the maker's optics
  from fixtures.json (cube 4 mm / 1 mrad, Guide v1.2 pp. 11-12, taken for the 7.5 W; UP-LA40WF < 1.3 mrad, no diameter published),
  `sceneScale` = the rig's one exposure number 0.02 (every lamp is candela x 0.02), no frame.
- `--laser-lines-only`: only `updateComponent` merge patches `{ laser }` on component `beam` of the beams the project already has;
  refuses when a project beam is not in the rig file; dry run unless `--apply`; reads back (entity count, every beam drawn, what
  else changed).
- Laser colour rule (`scripts/place/moxir_v2_8_floor.py` step 3): lasers / matrix / storm / lasers-breathe drive every line full
  green (V(525) 0.793 vs 0.048 at 455, 0.191 at 638); peak / white keep each cube's own colour; blue / red written for ice / fire
  scenes (none drives the lasers). `v1Looks` dropped a look's laser colour (each cube kept its own: 26 ash + 12 ember lines); a
  look's `laser_colour` now carries it, and no older rig file names one.
- Applied to the scratch project moxir-v2-9 (backup first, ~/di-backups/moxir-scratch/2026-10-13-v2-9-before-laser-lines/): only
  `beam.laser` on the 38 beams and the four looks' laser colours changed; 149 entities, cues identical.
- Undone: the owner's look on the stack; the maker's beam definition (1/e vs 1/e2, full vs half angle) is not published; the
  UP-LA40WF's own optics sheet; `__diMeasure.beams()` counting the new lines is read from code, not run.
