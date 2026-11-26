# fix/touch-minimap-2026-11-26

Owner N7040 (2026-11-26): "and why minimap not work right fix it".

## Cause
The Touch minimap is framed (`fitStage`) once, when the page opens. `handleStageResize` only rescaled the pan by the box ratio and kept the zoom, so when the box changed size the old zoom no longer framed the rig. Reproduced headless against the live desk's own page (33 fixtures, read-only, every POST aborted): 1536x864 -> 844x390 -> 1536x864 left all 33 lights as one 8 px square at (165,139) in a 338x283 box; the frame at 844x390 had been computed on a 25 px box (zoom clamped to 0.01). A tiled Hyprland window or a turned phone does the same.
Second cause: `.touchwrap .touchstage { min-height: 0 }` (two classes) beat the media rules `.touchstage { min-height: 110/120/140px }` (one class), so those minimums never applied; a short window (844x390) gave a 25 px stage, a 7 px rig.
Checked and fine: positions (x,y of all 33 vs the drawn boxes), colours (DMX read from /api/dmx, same `colourOfValues`), 33 distinct places at 1536x864, 2560x1440, 390x844, 1024x768. Not a tilt/beam bug: the minimap draws no beams or heads, only a square per light coloured from the output frame.

## Change
- app.js: a resize of the Touch box frames the rig again, unless the view was panned, pinched or zoomed by hand (`touchHandView`; the fit button clears it).
- style.css: the three short-window min-heights use `.touchwrap .touchstage:not(.folded)`.
- ui/touchStageFit.test.js: 3 guards, fail before (3 failed), pass after.

## Measured (headless, installed build = before, my files served into the same page = after)
- 1536x864 fresh: before = after, 33 of 33 inside the 338x283 box, rig 51,8 to 287,275.
- 1536 -> 844x390 -> 1536: before rig 8x9 px speck (165,139); after rig 51,8 to 287,275 again.
- 844x390 box height: before 25 px, after 73 px.
- 390x844 and 1024x768: unchanged, 33 of 33 inside, nothing cut.
- Pictures: before-*.png / after-*.png in this folder.

## Not checked
?view=touch (the page reads only #touch; that URL shows the Control page, minimap hidden at 0x0). A real touch device. The second monitor DP-3 (hyprctl lists only eDP-1, 2560x1440 at 1.667 = 1536x864 css).
