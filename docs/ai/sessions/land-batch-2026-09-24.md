## 2026-09-24 — one batch lands rig visibility, the VJ deck and the NDI autoscan together (#552 #553 #554)

- Why a batch: the three PRs touch the same 8 files (`docs/ai/known-fixes.md`,
  `scripts/di/cli.mjs`, `scripts/di/ui.mjs`, `serverXR/src/index.js`, `src/map/MapOutput.jsx`,
  `src/map/MapSurface.jsx`, `src/raw/components/DeskPanelWindow.jsx`, `src/wiki/wikiContent.js`)
  and #552 no longer merged into dev (after #550/#551). One branch from dev, `git merge --no-ff`
  in order #554 → #552 → #553, one CI round. Each PR keeps its own session note.
- Two conflicts, both from #552 onto #554; each resolved by keeping both sides:
  - `src/raw/components/DeskPanelWindow.jsx` — imports: both `ndiScanLine` (#554) and
    `describeRigRows`/`useRigVisibility` (#552); body: `useMachinePresence` keeps `ndiScan`, the
    NDI line and the rig-visibility rows are both computed. Render order on the Desk: rig rows,
    "Only this machine so far", the NDI line, then the machine cards (with #554's NDI sources group).
  - `docs/ai/known-fixes.md` — both new rows kept at the end of the table: the AuthGate card row
    (from dev, #551) then the rig-visibility row (#552).
- Auto-merged without conflict and read by hand: `cli.mjs` (`di status` rig line + `di ndi scan`),
  `ui.mjs` (`rigVisibility`, `ndiScan*`), `serverXR/src/index.js` (autoscan at boot + `host` passed
  to the rig), `MapOutput.jsx`/`MapSurface.jsx` (NDI poll/readout + #553's `assets`/`projectId` to
  the stage), `wikiContent.js` (new VJ deck entry, rig entry and NDI entry both bumped to 09-24).
- Checked on this branch: lint 0 errors (68 warnings), build ok, full vitest 546 files / 6069 tests
  passed (6 skipped: `serverXR/src/ndi/live.test.js`, needs `NDI_LIVE=1` and a real runtime),
  `test:server-contracts` 171/171, suites ndi 274 (+6 skipped), rig 273, tops 106, raw 752, map 208.
- NOT done here: nothing was looked at in a browser on this branch — each PR's own note says what
  it saw and where. Merge this AFTER #524 (dev → main).
