## Laser desk: the Looks bank keeps its row height, 72 tiles scroll instead of squeezing (2026-10-31)
- The owner (2026-10-31, Projector Room, the stage Mac's laser desk): "the UI is so bad, the preview things, fix that".
  The bank holds 72 looks; its rows were 17 px instead of 93 px, names cut in half, pictures over the next row.
- Cause (measured on the agent screen with the same 72 looks, read from the Mac): `.tiles` is a grid in a fixed-height pane
  and `.tile` has `min-height: 0`, so the auto rows start at base size 0 and share the free height. The squeeze also made
  every tile count as on screen: all 72 tiles redrew every 50 ms (1440 draws a second).
- Fix: one property, `.tiles { grid-auto-rows: max-content }` in `ui/desk.css`. Window 1280 x 670: row 16.9 to 93.2 px, tiles
  on screen 72 to 21, draws a second 1440 to 409. Window 1280 x 760: 21.3 to 93.2 px, 72 to 28, 1404 to 546. The bank
  scrolls to its last tile. The element geometry of the Setup tab and of the Stage and Edit panes is identical before and after.
- Guard: `ui/deskCss.test.js` (a text contract; jsdom has no layout engine) and the known-fixes entry. Not changed: the tile
  redraw rate (50 ms), the look of a tile, the number of columns; the redraw rate is a separate decision of the owner.
- Not tested: the page on the Mac itself (seen only on the agent screen, Chromium at device pixel ratio 2).
- Built for the Projector Room Mac as a test copy on top of the commit it runs (0.4.4-look.4edc8a4b).
