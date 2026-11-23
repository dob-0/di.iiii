## Laser desk: the stops never move; tile names wrap; dark Follows select; plain Safety words (2026-10-31)
- Found by a look at the final copy (copy9) on the agent screen, 1278x758 and 1100x758 at device scale 2 (report F1-F3, F5, F6 in
  ~/work/agent-reports-2026-10-31/projector-room/copy9-look/REPORT.md), built for the Projector Room show. Pictures and numbers of this
  job: ~/work/agent-reports-2026-10-31/projector-room/desk-ui/REPORT.md.
- Top bar (`desk.css`, `index.html`, `desk.js`): the controls were one flex-wrap box, so a followed scene's status (240 px) wrapped it to a
  third line and moved Disarm all from the right end to x 256-343 on that line (bar 128 px). The pill, Blackout, Release and Disarm all are
  now one `.stops` group (flex none, margin-left auto) at the right end of the show row. The follow label, "Blackout keeps the arm" and the
  status moved to an `.options` row beside the page tabs; the status has a 200 px basis that only shrinks, an ellipsis, and its whole
  sentence as the title. Measured with the longest real names and pills: bar 91 px, Disarm all x 1181-1268 (1278) and 1003-1090 (1100),
  y 52, the same for every status text and pill text.
- The show row needs about 1022 px with the longest pill (210 px, "Disarmed · 1 cube · 1 stopped"; computed from the measured parts, seen
  fitting at 1100 and wrapping at 900); narrower, its left tools wrap inside their own box (900 px: bar 128 px) and the stops stay at the right end of the first line. The whole header stays two rows: one row would need
  about 1500 px for its 15 controls, so "one row" is met for the controls row, not for the tabs.
- The status reads "Followed MUTH 05 Catacomb" (one name when the scene and the look share it), "Followed A → B" when they differ.
- Tiles: names wrap (a look name is at most 40 characters, cut server-side in `normaliseLook`), no ellipsis anywhere: 10 of 72 were cut, 0
  now; rows with two-line names are 109 px high (was 93), tile width unchanged.
- Light desk scene list (`lighting/ui/style.css`, `app.js`): the laser note sat in an inline span, where text-overflow does nothing, so it
  was cut with no ellipsis; it is now a block with an ellipsis and its whole text as the title (bank row and Touch tile); `margin-right: -8px`
  keeps notes that fitted fitting. The filter box was 42 px with Follow off too (it predates a749f8443, which changed no markup or rule of it):
  it now takes the first row (209 px) and the buttons wrap under it.
- Edit: "Follows light scene" is a full-width select under the preview, above Shape, in the page's own tokens (it was a native mid-grey select
  below the fold). An inline label beside it was tried and clipped a 23-character name at the arrow, so the label stays above. Setup > Safety says the sign-off and dark-rule modes from the engine's state in plain words; the DI_LASER_ names stay in the wiki.
- Phone (390 px, one look): the pill first, the three stops together, the options last. That order is new.
- Tests: `deskCss.test.js` (DOM and rule tests), `desk.test.js` (status text, Safety lines), `lighting/ui/sceneListCss.test.js`; the nine new
  rule tests fail on the original css, html and app.js. `npx vitest run serverXR/src/laser serverXR/src/lighting src/wiki`: 31 files, 466 tests passed.
- Not tested, owed: the Mac's own Chromium and its fonts (every width above is this machine's), a real cube, the installed copy. The wiki line
  on Follow light scenes could name the status; not changed (outside this job's files).
