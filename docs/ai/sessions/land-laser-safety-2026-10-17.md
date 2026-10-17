## 2026-10-17 — laser safety: a DMX laser rests dark when patched; the six commits #1009 missed

- **Why this branch exists:** #1009 (`feat/laser-play-2026-10-16`) was squash-merged by auto-merge at 2026-10-16 23:24 UTC, at the
  commit before the laser-safety work. Six more commits were pushed to that branch afterwards and sat in no pull request, so dev,
  the dev release and the installed di on aylmo did not have them (measured 2026-10-17 06:1x: `own.dimmer != null` absent from
  the installed `engine.js`). This branch carries exactly those six, cherry-picked unchanged onto dev (`-x` lines name the sources).
- **Laser safety:** `makeFixture` forced `values.dimmer = 255` for every patched lamp, so a DMX laser (UP-LA40WF, whose chart rests
  its output at 0) came up at full on every re-patch. It now takes the chart's own resting dimmer when there is one
  (`serverXR/src/lighting/engine.js`); a plain lamp still comes up at 255. The chart gives the laser's output channel `default: 0`
  (`fixtureTypes.js`, `types/moxir.json`). Test in `serverXR/src/lighting/tests/test.js`: on dev's engine it fails
  ("the laser rests dark, got 255": 137 ok / 1 FAIL); with the fix 138 ok / 0 FAIL.
- **The room draws what the rig shows (desk connected):** a DMX laser takes the colour the desk picked (UP-LA40WF ch 5) and its
  output (`dmxDecode.js`, `dmxPose.js`); a lamp the desk does not drive is drawn dark, as on the rig.
- **`scripts/rigbuild/all-colour.mjs`:** hold the rig at one colour for the colour sync, `--release` to give it back. Never lights
  lasers or hazers. Nothing runs it on its own.
- Tested here: `npx vitest run rigbuild/dmxDecode rigbuild/dmxPose rigbuild/fixtureTypes rigbuild/cueRun` 50 passed; lighting
  `test.js` 138 ok, `test-http.js` 124 ok, `test-rigpatch.js` 14 ok; eslint on the changed files 0 errors; docs and fallback checks
  green. Owed: `all-colour.mjs` has no test; nothing here was seen on the real rig (the install check reads the controller's DMX
  output, not a lit laser).
