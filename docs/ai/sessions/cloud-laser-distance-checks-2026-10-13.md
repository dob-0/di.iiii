## 2026-10-13 — Laser >= 3 m checks in one shared module (cloud agent)

- Found: the laser audience-distance check in `scripts/rigbuild/versions.test.js` picked lasers by
  `fixture === 'laser'` only, so the 6 LaserCubes (`fixture: 'lasercube'`) of `known-full` and `known-kit`
  were never checked there. The build path (`rig-lib.mjs` buildRig, `LASER_FIXTURES`) did already cover them.
- Moved: `LASER_MIN_HEIGHT_M`, `LASER_FIXTURES`, `checkLaser` out of `scripts/place/rig-lib.mjs` into the new
  pure module `scripts/place/laser-distance.mjs` (re-exported from rig-lib, so existing importers are unchanged),
  plus `isLaserGroup` (the build's own test, now used by buildRig), `laserLampsOf` (whole-id match, no
  prefix clash between groups), `laserLampFailure` / `laserDistanceFailures`.
- `versions.test.js` now calls the shared check; new `scripts/rigbuild/laserDistance.test.js` asserts that
  every version x look checks ALL its lasers (count taken straight from the rig file), that the 6 cubes are
  in `known-full` and `known-kit`, and unit-tests the check itself.
- Red first, measured: with the old selector in the module, `laserDistance.test.js` was 51 failed / 57 passed
  (25 looks x 2 cube versions + the prefix unit case); with the module's real selector, 108 passed.
- Laser/versions set (versions, versions-xflat, laserLantern, knownKit, rig-lib, safety [+ laserDistance]):
  before 6 files / 637 tests passed; after 7 files / 745 passed. `eslint` clean on the four files.
- Wide run, `vitest run scripts shared` (this sandbox): origin/dev 4 failed / 2552 passed (174 files); this branch
  4 failed / 2660 passed (175 files): +108, the new file. The same 4 fail on both, all in `scripts/di/`
  (`oneAddressPrinted.test.js`, plus `openFile.test.js` failing to load) — not this change; cause not investigated (UNVERIFIED).
- UNVERIFIED: any real-world laser safety — 3 m is the picture's floor, not an assessment (unchanged).
  No visual change (no render path touched); not looked at in a browser.
- Next: owner's call whether this coverage gap earns a `docs/ai/known-fixes.md` row (left out: task scope).
