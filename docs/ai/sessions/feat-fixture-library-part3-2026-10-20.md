## Fixture library part 3: readers move to the library, types/moxir.json retired

- Split of PR #914, part 3 (part 1 = #1039). `src/rigbuild/types/index.js` now builds TYPE_LIBRARY from `types/library/` (index order + one file per type, `import.meta.glob`); node scripts and tests read it with `loadLibrary()` (`scripts/rigbuild/library.mjs`).
- Readers moved: types/index.js, footprints/realism/sway/versions.mjs, lights_beta_options.py (default is the library dir), 15 tests (patchPlan, rigProgress, autoPatch, circuitSupply, moxirV2Patch, mvr, rigSteps, sheet, strobeCap, dmxDecode, uplusProfiles, PatchSheetSurface, useRigAutoPatch, moxir-v2-ground, cut, laserMoments). Comments and READMEs name the library, not the old file.
- Before deleting: a temporary test loaded every type three ways (old file, `loadLibrary()`, glob `TYPE_LIBRARY`): same ids and order, 13 of 13 types deep-equal both ways, top-level fields equal (28 tests passed). Nothing outside the repo reads the file (only old reports in ~/work/agent-reports-*).
- Deleted `moxir.json` and `ALIAS_FILE` (types.mjs); `noMoxirJson.test.js` fails the build if a code file names it again.
- Not in this part: loading only the project's types (part 4, `projectTypes.js`).
