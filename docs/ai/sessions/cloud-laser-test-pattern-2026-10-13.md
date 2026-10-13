## 2026-10-13 — Laser test: every laser unit's scan field as a square on the real surfaces (cloud agent)

Owner 20:5x: "create a laser test pattern scene: squares, so I see how many metres they throw … if I change the device place it
changes … I will move the fixtures by hand … I sync visually in the real hall." Branch `cloud/laser-test-pattern-2026-10-13`,
base `713ee91a` of `fix/moxir-selection-box-and-scenes-2026-10-13`.

### Spec sources (task 1)
- **LaserCube Ultra MK2** scan field: stays **ASSUMED** ±18.5° (the record's reading of the maker's ">37°"). The maker's page
  `https://www.laseros.com/lasercube-models/` could NOT be fetched from this session (DNS refused), so the ">37°" wording was not
  re-read. WebSearch 2026-10-13: retailer listings (e.g. `https://www.idjnow.com/x-laser-lasercube-7-5w-laser-system.html`, the
  pre-MK2 7.5 W) print "AT-40S galvanometer scanners, 35K PPS @ 7° scan angle" — that is the galvo's pps rating condition, not a
  field, and is not used as one. No MK2 field figure found. Noted in `fixtures.json` (lasercube `scan_field_half_deg.note`).
- **UP-LA40WF**: no scan angle found (WebSearch 2026-10-13, no page for the unit; the maker's page `uplight.com.cn/pd48855201.html`
  and the equivalent's `bluesealighting.com/…` could not be fetched, DNS refused). Stays **ASSUMED** ±18.5° (the cube's, itself
  assumed). Noted in `fixtures.json` (laser `scan_field_half_deg.note`). The first thing to do in the hall: read the unit's menu/ILDA size.
- Every square in this feature is therefore only as true as that half-angle; the label's metres are exact for the field assumed.
  A unit may carry its own `beam.laser.fieldHalfDeg` and the test reads it.

### What changed
- `src/studio/utils/laserTest.js` (pure): unit key (`beam.laser.unit`, else the id without its trailing letter), unit frame
  (**origin = mean of the beams' positions, axis = normalised mean of their directions** — the rule of `laser-frames.mjs fanOf`;
  right = axis × world up), the field corners (axis turned by tan(±H) along right and up, as `fieldDirection` draws the field),
  measurement between hit points (**width = mean of top and bottom edges, height = mean of left and right edges**), the label.
- `src/studio/components/LaserTest.jsx` (in the Canvas): five rays per unit (four corners + centre) with a three `Raycaster`
  (`firstHitOnly`; three-mesh-bvh's accelerated raycast is used where SmartView built a tree on the walls — not forced elsewhere),
  against the building only (`classifyArchitecture`; if none named, every non-rig entity); never beams (`beamPick`/`noBounds`),
  lamps (`svPick body`, rig entities), instanced fixture bodies (no entity), helpers or its own overlay. Material side is ignored
  during the cast. White `lineSegments` over the edges whose two corners hit (depth test off), one `Html` label per unit
  (`.laser-test-label`, Studio's mono face and 2 px radius token). Recomputed when a laser entity's transform/field/visibility
  changes in the project (a key), plus up to 12 re-measures at 1 s while any ray found nothing (late-loading models). Never per frame.
- `ScenePicker.jsx`: a "Laser test" button (`scc-btn`, `aria-pressed`) next to "Follow the show"/"Work light"; shown only when the
  project has laser lines; the window now also shows for a project with lasers and no scenes. State lives in
  `StudioPresentationSurface` (`laserTest`), not in the document.
- Moving a unit by hand (`pickPriority.js` + `StudioViewport.jsx` + `StudioEditor.jsx`): the entity group carries `userData.svUnit`;
  **Alt+click** on any line selects all lines of its unit (Shift adds, locked lines stay out), and **Shift+G** ("select grouped")
  expands the selection to whole units; the existing multi-selection gizmo then moves the unit. Plain-click rules untouched.
- Help: `studioGuide.js` rows (Laser test, Alt+click a laser line, Shift+G); wiki article `laser-test` (`src/wiki/wikiContent.js`).

### Tests
Baseline (base `713ee91a`, root `npx vitest run`, run before `npm ci` in serverXR): 9911 passed / 206 failed in 55 files —
every failing file was a serverXR/scripts file failing at import for want of `serverXR/node_modules` (plus my own new test
file, then mid-writing); no `src/` test failed. After `npm ci` in root and serverXR, with the feature: **10543 passed / 4 failed**
(943 files, 1 failed): the 4 are `scripts/di/oneAddressPrinted.test.js` (expects `diiii.localhost`; this sandbox resolves
`localhost`) and they fail identically on the base (checked by stashing the change). `npm run test:server-contracts`: 231 passed /
15 files. `npm run lint`: 0 errors (104 warnings, none in new files); `npm run build` ok; `docs:ai:sync` and `docs:ai:check` pass.
New (+20 tests over the base): `laserTest.test.js` 10 (unit grouping, corners at 10 m = 2·d·tan H = 6.69 m, a wall 30° off square, doubling with distance,
vertical axis, labels), `LaserTest.test.jsx` 5 (real three scene: wall faces away, a lamp body and a beam mesh in front are
ignored, 6.7 × 6.7 m · 10.0 m, the unit moved to 20 m doubles, no surface, own `fieldHalfDeg`), `pickPriority.test.js` +3,
`ScenePicker.test.jsx` +2.

### UNVERIFIED
No browser: not looked at on desktop or phone, no screenshot opened (`npm run verify:surfaces` not run). Not run: the overlay in
the real MOXIR hall (the label's legibility on 18 units at once, outline over the hall's actual meshes, whether the hall's walls
are the meshes `classifyArchitecture` finds), Alt+click against r3f's real pointer events (the unit pick is tested on the
pure handler), Shift+G in the live editor (the unit expansion is tested; the key branch is not), the square following a live
gizmo drag (it follows on release, when the project changes). Alt+click may be intercepted by some window managers.

### Next
Open the Studio on a project with lasers, press Laser test, look at desktop and a phone; Alt+click a cube line, G, and watch
the square follow. Then read the 40 W's and the cube's real scan angle on site and replace the two ASSUMED half-angles.
