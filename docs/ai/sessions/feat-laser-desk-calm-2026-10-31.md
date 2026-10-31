## Laser desk: calm drawing is the default, today's full motion kept as a mode (2026-10-31)
- Why: on the Projector Room Mac (MacBook Pro 2015, Intel Iris 6100) the Control tab held the Chromium GPU process at a full core and the CPU
  package at 101-105 C, throttling. The page drew every on-screen look tile every 50 ms (72 looks) and the stage every 80 ms.
- `ui/drawCalm.js` (pure rules, `window.DiLaserCalm`) and `ui/desk.js` (the "calm drawing" block, `playTiles`, `pollView`). Mode **calm**
  (default): a tile is a still picture (look at beat 0), drawn when its look, its size or the beat changes; the tile on the laser, the tile
  open in Edit and the tile under the pointer play (at most 20 pictures a second); the Preview draws at most ~30 a second, nothing while
  the page is hidden; the stage is asked every 500 ms unless a cube is on or a look is open in Edit (then 80 ms) and a cube whose points
  did not change is not drawn again (FNV-1a over the points); the frame loop wakes ~30 times a second, not 60. Mode **full** is the
  code as it was (nothing lost): every tile on screen plays, the stage is asked every 80 ms.
- Control: "Motion: calm | full" in the Looks header, kept per browser in localStorage (reads and writes in try/catch). The control is
  built by desk.js and sized to the header's own line (CSSOM): desk.css and the tile bank's height are unchanged (a taller control cost a row).
- Measured on the agent screen (aylmo, RTX 3080 route; 1280x760 CSS px at 2x; the Mac's 72 looks in a scratch server; 60 s each; one cube; the
  live look open in Edit). Pictures drawn a second: 1435 -> 61 (css as is), 582 -> 42 (grid fix). Stroke calls a second: 23055 -> 306 and 15708 ->
  209. Renderer + GPU process CPU, % of one aylmo core: 45.2 -> 23.0 and 24.5 -> 14.9; GPU-process main thread 18.8 -> 6.8 and 9.0 -> 4.0.
  An idle desk costs 5.5 % (renderer 2.9, GPU 1.1, browser 1.0, utility 0.5), a blank page 0.1 %. Full in the new code = the old page
  (50.4 vs 50.2 % and 1446 vs 1435 pictures a second). Not measured: the Mac itself (aylmo's cores are faster; the pictures a second are the
  hardware-free number). Tool and method: `scripts/audit/laser-desk-cpu.cjs`.
- What is left in calm is the live look's Preview and stage canvases (big canvases: ~0.3 % of a core per picture a second against ~0.01 % for a tile).
  Next levers, not built (the owner's rules say only what was asked): a lower Preview rate when no slider moves, a 1x backing store for the Preview.
- Owed, outside the drawing loops: `refreshDesk` rebuilds editor chips and swatches every 500 ms; the window `resize` rebuilds all 72 tiles;
  the grid CSS (another branch). Wiki entry `laser-desk` says both modes.
- Tests: `ui/drawCalm.test.js` (rules), `ui/deskCalm.test.js` (the page: which tiles play, stage interval armed and disarmed, no redraw of an unchanged
  stage picture, 20 and 30 pictures a second caps, hidden page, backing store kept, still redrawn on look, beat and size change, full mode),
  `ui/deskCalmStored.test.js` (stored choice read at load; a browser without storage). Not tested: the Mac, a real cube.
