# Laser desk layout: Grid and Classic (session note, 2026-10-31)

Branch `feat/laser-desk-layout-2026-10-31` from `c19a83534`. Why: `docs/ai/decisions/2026-10-31-laser-desk-layout.md`. Owner, 21:4x: "fix the laser desk: the place is not used right, the windows inside are managed not right, it is ugly and not logical".

## What was built
- Grid layout appended to `serverXR/src/laser/ui/desk.css` (one size query, every rule under `html[data-layout="grid"]`); the switch `Grid | Classic` in the top bar; `layoutMode.js` chooses (`?layout=` > `diLaserDeskLayout` in localStorage > DEFAULT 'grid'). Classic is kept whole as a mode. `desk.js` is untouched.
- Fixes on top of the first Grid draft: the My colours hint is an ellipsis with a title (not hidden); the colour palette is docked inside the strip in two columns; the cube note is one line; the notes the layout may clip keep their words in a title; labels and the Master slider are 22 px or more.

## Measured (real page, desk.js running, scratch stack, the Mac's data; Chromium of the agent screen, not the Mac's)
| layout-size | looks fully visible | tiles area | overlaps | scrollHeight / viewport | Disarm all |
|---|---|---|---|---|---|
| grid-1280x670 | 27 of 79 | 1024 x 292 | 0 | 670 / 670 | y 9.2 |
| grid-1280x700 | 27 of 79 | 1024 x 322 | 0 | 700 / 700 | y 9.2 |
| grid-1278x758 | 36 of 79 | 1022 x 380 | 0 | 758 / 758 | y 9.2 |
| grid-1240x640 | 18 of 79 | 984 x 262 | 0 | 640 / 640 | y 9.2 |
| classic-1280x670 | 7 of 79 | 894 x 146.9 | 0 | 670 / 670 | y 52 |
| classic-1280x700 | 7 of 79 | 894 x 163 | 0 | 700 / 700 | y 52 |
| classic-1278x758 | 7 of 79 | 892 x 194 | 0 | 758 / 758 | y 52 |
| classic-1240x640 | 7 of 79 | 854 x 130.9 | 0 | 640 / 640 | y 52 |

Classic equals the audit zone table of the stage code within 0.0 px. A switch both ways needs no reload (the page's ResizeObserver brings --bar-h back: "91px" in Classic, 0px in Grid). Disarm all is at the same place in 7 states in each layout.

## Not seen
The Mac's fonts and Chromium, a touch screen, a real cube.

## Owed
Setup page in Grid, pages for 79 looks, a taller cube zone for 3+ cubes, the Motion chips at 16 px (inline in desk.js), the default flip and the stops move (owner's word).
