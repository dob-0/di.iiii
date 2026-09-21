## 2026-09-21 — a lamp that knows which lamp it is, and positions go back once on a button

Steps 3 and 4 of "one project is one stage" (`di-atlas/decisions/2026-09-20-one-project-one-stage.md`),
on top of step 2's rig mirror (`feat/rig-mirror`).

- **The one schema change.** `components.fixture = { index }` on an entity — the fixture's
  `index` on the lighting desk (`3.Back left`), a positive whole number and nothing else.
  Never universe/address: those are the machine's `show.json`. `normalizeEntity` in BOTH
  `src/shared/projectSchema.js` and `shared/projectSchema.cjs` keeps `{ index }` and drops
  anything malformed, which is also how the inspector clears it (`{ index: null }` through
  the ordinary `updateComponent` op). Proven through the wire, not the ESM copy:
  `serverXR/src/projectContracts.test.js` "keeps components.fixture = { index } through a
  real write and read" boots a real serverXR, writes a spot with `{ index: 3, universe: 1,
  address: 17 }`, reads back `{ index: 3 }`, clears, reads back nothing. Parity fixtures added
  to `schemaSync.test.js`.
- **One inspector field.** `src/studio/components/FixtureField.jsx`, reached through a `Desk`
  section on point, spot and directional lights (`src/project/entityRegistry.js`; an ambient
  light is not a lamp on a bar). A plain number when there is no desk here; the desk's own
  list, `index.name`, one entry per number, when it is live. A number the desk has not
  patched stays visible as `7. not patched` rather than silently reading as none.
- **The lamp draws what the desk says.** `src/rigMirror/liveLight.js`: `useLiveLightEntity`
  selects ONE fixture out of the mirror store by index (re-renders only when that fixture's
  colour/level changes, never on every 10 Hz frame of the rig), and hands `EntityContent` a
  copy of the entity with `light.color` replaced by the desk hue at full and
  `light.intensity` = authored × level. Desk absent → the authored entity, the same object.
  Wired in `StudioViewport.jsx`'s `SelectableEntity`; the document is never written. **A
  decision the owner should look at:** the level MULTIPLIES the authored intensity rather
  than replacing it, because three.js intensities are reach, not percentages (a spot at 2,
  a point at 1); and the override follows the desk whenever it is present, whether or not
  the Lights markers are switched on — the toggle draws markers, the join is the join.
- **Positions go back once.** `src/rigMirror/sendPositions.js` POSTs the desk's own drag
  route, `POST /light/api/fixtures/move {moves:[{id,x,y}]}` (it already existed — no server
  route added), walking `rigFloor.js`'s mapping back exactly (plan→world→plan is the identity,
  tested). One click on **Send positions to the desk** (control cluster, beside Lights, drawn
  only while Lights is on), one request, one line as a chip beside the button for six
  seconds: "3 lamps moved" / "no desk on this machine" / "no lamp has a fixture number yet" /
  "no patched fixture has those numbers" / "the desk did not take it (403)". The ONLY write
  the app makes to the desk. The line was first put in the rig's bottom pill and landed ON
  TOP of the first-run coach ("Open Create and add something") on the very first press —
  the stacking step 2 judged unlikely — so it moved next to its button, reusing `.scc-btn`,
  no new CSS. Two fixtures sharing an index both move (the desk does not enforce unique
  numbers); a lamp inside a group lands where the group's offsets put it (parent rotation
  and scale are not applied — stated in the code).
- `RIG_FLOOR`/`rigFloorPosition` moved to `src/rigMirror/rigFloor.js` (re-exported from
  `RigMirror.jsx`) so the sender does not pull drei/troika into a plain module.
- The wiki still called the button "Rig" after the rename to "Lights" — fixed, and guarded
  in `StudioControlCluster.rig.test.jsx`; known-fixes row appended.
- **Looked at**, headless Chromium (SwiftShader) 1440x900 @2x against the BUILT app served
  by serverXR on 4372 (`CLIENT_DIR=dist`, `DI_LOCAL=1`) with a throwaway desk (output off):
  authored white spot → amber the moment fixture 1 is patched amber; the loose lamp stays
  white; inspector Desk → `Fixture: 1.Back left`; Lights on, one press → "2 lamps moved" and
  `GET /light/api/state` answers x 0.3 y 0.3 / x 0.7 y 0.6 for lamps at (-2,3,-2) and (2,2,1)
  — the exact inverse of the floor mapping; blackout → the spot's cone goes grey and its pool
  disappears. NOT verified: a real rig, a phone, the published viewer (`LiveProjectScene`
  does not follow the desk — Studio only, on purpose for this step), Raw's viewport.
- **A trap that cost an hour, for the next worktree.** This worktree's `node_modules/`
  held a stray `node_modules/node_modules -> ../di.iiii/node_modules` symlink (the leftover
  of a `ln -s` into an already-existing directory). Vite's optimizer AND the production
  build then carried TWO React runtimes — every hook threw "Cannot read properties of null
  (reading 'useState')" on the login page, in dev and in `dist/`, with one `react@18.3.1`
  in `npm ls`. Diagnostic: `grep -o "ReactCurrentDispatcher:" dist/assets/react-vendor-*.js
  | wc -l` — 2 means two Reacts. Removing the two stray links fixed dev, build and the suite.
- **Don't stop a stack with the driver.** `driver.mjs stop` matches every `src/index.js`
  on the machine; my server on 4372 was killed from outside mid-walk (log ends cleanly on a
  200). Killed and restarted only by pid.
