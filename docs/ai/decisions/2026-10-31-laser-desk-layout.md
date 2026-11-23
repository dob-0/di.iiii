# The laser desk has two layouts: Grid (new default) and Classic (kept whole)

Date: 2026-10-31 · Place: Hayfilm MOCT, Projector Room, doors 22:00 · Stage code: `c19a83534` · Branch: `feat/laser-desk-layout-2026-10-31`.

## The ask

The owner, 21:4x: *"fix the laser desk: the place is not used right, the windows inside are managed not right, it is ugly and not logical; research the best UI things for our job; fix it now."*

## The problem, measured (audit of the desk as it was, scratch stack, 1280x700, the Mac's own data: 79 looks, 10 scenes)

- The Looks bank was a keyhole: 7 of 79 looks fully visible, the grid area 16.3 % of the screen.
- Edit was a second screen: a 360 px column 2.09 times taller than its window; Colour, Picture, Movement and Copy/Delete were below the fold at rest.
- A question from a link (`?set=`, `?remove=`) filled the whole Looks pane.
- The top bar was 90.5 px in two rows, 63 % of it empty.
- The Stage card was 558 x 174 px for one cube while the bank was starved.

## The options

Two designs were drawn on paper and on a static copy of the page, and a judge compared them (`~/work/agent-reports-2026-10-31/projector-room/laser-layout/judge.md`).

| | Grid-first (taken) | Rows (a source of five small grafts) |
|---|---|---|
| fully visible looks at 1280x700 | 27 (36 at 1278x758) | 20, from budget only |
| top bar | 50 px, one row | 91 px, not fixed |
| Scenes row | 88 px, every word kept | 62 px but hides the "laser:" line |
| needs | no `:has()`, no `aspect-ratio` | `:has()` for its ask |

## The decision

1. **Grid is the layout of a browser with nothing stored; Classic is one click away and stays whole.** This is the lead's call, under the owner's rule "a new default only by his word": the default is ONE constant (`DEFAULT` in `serverXR/src/laser/ui/layoutMode.js`); setting it to `'classic'` ships the old look first. The owner confirms or flips it.
2. **Classic is a mode, never an edit** (owner 2026-10-29, "what we have never lose"): every rule of the stylesheet above the Grid block is untouched, the Grid rules are appended under `html[data-layout="grid"]` inside one `@media (min-width: 1240px) and (min-height: 640px)`, and no element is moved in the HTML. Below 1240 x 640, with `?layout=classic`, or when `layoutMode.js` did not run, the page is Classic.
3. **Choice**: `?layout=grid|classic` (a valid one wins and is kept) > the choice kept in this browser (`localStorage` key `diLaserDeskLayout`, all access in try/catch) > the default. The two buttons "Grid | Classic" sit in the top bar next to Control and Setup.
4. **The stops move in Grid** (Blackout, Release, Disarm all go from the second row, y 52, to the top row, y 9) and stay alone at the right end, above the Keys sheet (z-index 60 over 20). In Classic they stay at y 52. This is the one thing a hand trained on Classic will feel; it is the owner's to approve with the default.
5. **desk.js is not edited.** The page's own `ResizeObserver` and `resize` handler redraw after a switch; `layoutMode.js` fires one `resize` so the tiles redraw.

## The owner's marks (GIMP, 2026-10-31 22:58, `laser-marked.png`)

He drew two rings on the live Classic desk and wrote on them (his words, kept):
1. Blue ring around the Looks grid and the Edit panel: *"this is the most thing that we need, and it needs to slide, so check all the UI and fix."*
2. Pink ring around the Stage preview: *"this is so big and it can be small."*

How Grid meets each, measured on the real page (desk.js running, scratch stack, the Mac's data, one cube; script `marks-check.cjs`, numbers in `build/marks-metrics.json` of the agent report folder, shots `build/marks-*.png`):
- **Mark 1, the Looks grid is the main surface and it slides.** 1024 x 322 px at 1280x700 = 36.8 % of the screen (Classic 894 x 163 = 16.3 %); 27 of 79 looks fully visible (Classic 7; 36 at 1278x758, 27 at 1280x670, 18 at 1240x640); nine columns, keys 1-9 printed; its own scrollbar, and scrolled to the end the Scenes row, rail, Stage, Edit strip and stops did not move (rectangles identical before and after). Edit stays on the screen with it: all 6 edit groups in view, no scroll (Classic at 1280x700: 1 of 6 in view, 661 px of Edit hidden below). Edit is a strip under the grid, not a side column, because a side column can only show its six groups by scrolling; the strip shows all six at once.
- **Mark 2, the Stage is small.** 232 x 96 px at all four sizes (Classic 896 x 272 at 1280x700, 894 x 299 at 1278x758), one line: each cube a 62 px picture with its name, state and warning beside it; more cubes than the rail holds scroll sideways. 96 px is the lead's number; the owner said only "it can be small".
- **What the smaller Stage frees:** the rail's last rows (124 px at 1280x700, 94 at 1280x670, 182 at 1278x758, 64 at 1240x640) are the notice slot: a message shows there and covers nothing; the slot is empty when there is none. Not built, one pick advised: bigger touch targets for Master and Tap (36 px) in that height; the other option is a taller cube zone for 3 or more cubes.

## What was refused, and why

- A hole where text was (`#myColoursHint { display: none }`): the text is kept, as an ellipsis with its words in a title.
- A colour palette that floats over the Looks: it is docked inside the strip (over the Picture and Movement columns), so nothing floats over another zone. The first version (340 px wide, one column) needed 233 px in a 188 px slot; two columns (the palette | the title, Close, any colour) fit.
- Hiding the "laser:" line, a 42 px cube thumbnail, 22 px swatches, 16 px slider tracks, `:has()`, five re-parented zones (all from the Rows design).

## Words

"Layout", "Grid" and "Classic" do not clash with `docs/ai/vocabulary.md` (`layout` there is the Studio's panel arrangement; Beat Grid is a node). They name the laser desk's two arrangements only; no row is added.

## Owed (not done in this change)

- The Setup page keeps its two panes unchanged (its empty space and the duplicated scene text are open).
- Pages for 79 looks (the bank still scrolls), a taller cube zone for 3+ cubes (six cubes are worse than Classic), the Motion chips at 16 px (their height is set inline by `desk.js`).
- Not seen: the Mac's fonts and Chromium, a touch screen, a real cube.

## Undo

One browser: the "Classic" button, or `/serverXR/laser/?layout=classic`. Everyone: set `DEFAULT = 'classic'` in `layoutMode.js`. The whole change: revert the merge; the stylesheet above the Grid block is byte for byte what it was.
