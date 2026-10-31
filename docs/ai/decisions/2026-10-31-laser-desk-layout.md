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

## 2026-11-01 addendum: from 1240 px wide Edit is a column at the right

**The owner**, looking at the Grid at 1598x771 on 2026-11-01: *"why there are still colour full things and still too many gaps in the ui"*. His marks of 2026-10-31 (`agent-reports-2026-10-31/projector-room/OWNER-MARKS.md`, items 1 and 2) had said it: the Looks grid and the Edit panel are the main surface, side by side (his ring on Classic at 1280x700); the grid scrolls and Edit stays reachable beside it; the Stage picture is small, about 96 px, never a big box.

**What a peer measured on his screenshot** (scratch stack, the Mac's checkpoint bank and the fresh bank he saw; `measure-gaps.cjs`, `numbers-before.md`): (1) Edit's help lay over the slider labels (9 to 15 text overlaps with nothing open); (2) the Edit strip was 51 to 76 % empty; (3) the right column was 40 % empty under the Stage; (4) the Scenes row was 88 px tall for the words "The light desk has no scenes." The colourful tiles are the built-in shapes in their own colours: by design, not touched.

**What moved** (`desk.css`, every hunk inside the one Grid block; `desk.js`, 8 lines; `index.html`, 2 attributes and the switch's words):
- From 1240 px wide Edit is a column at the right (440 px) under the masters (75 px: 73 measured plus 2), the follow switches (one line, 50 px) and the Stage (96 px). The Looks run to the bottom of the window and take every pixel freed. One nested query, the last thing in the Grid block.
- Below 1240 px Edit is the strip along the bottom, as on 2026-10-31, with Follows, Cubes and Copy/Delete in cells of their own.
- Edit with no look open stays drawn where it is, dimmed (opacity .45, grey swatches) and not clickable (inert in the first build, see addendum 2); its help sits where the preview goes. Nothing jumps when a look opens.
- With no light scenes the Scenes row is one 24 px line (`desk.js` marks the Looks pane `.no-scenes`; the link question moves up with it).

**What it replaces, and how it is kept** (nothing we have is ever lost):
- The 2026-10-31 strip above 1240 px is kept as the strip below 1240 px. The exact desk of 2026-10-31 is the annotated tag `laser-desk-grid-2026-10-31` on `63d9dc1dd`: `git worktree add ../di.iiii-grid-1031 laser-desk-grid-2026-10-31`, then `di-dev up grid-1031`.
- Classic stays whole behind the switch: no rule above the Grid block changed (`deskLayout.test.js` pins it); seen at 1280x770, rest and open.
- A mode that gives the old wide strip back above 1240 px is not built; it is the owner's call.

**Numbers, before then after** (real bank: 1 cube, 11 light scenes; fresh bank: 6 cubes, none; method and raw data in `numbers-before.md`, `numbers-after.md`, `numbers-before-extra.md`, `numbers-after-extra.md`, `check-after.json`, `check-after-emptybank.json`):

| measure (target) | 1280x770 | 1598x771 |
|---|---|---|
| text overlaps in Edit, nothing open (0), real / fresh | 13 / 15 then 0 / 0 | 9 / 11 then 0 / 0 |
| overlaps with a look open (0), real / fresh | 0 / 4 then 0 / 0 | 0 / 4 then 0 / 0 |
| right column empty under the Stage (15 % at most) | 39.5 % then 0 % | 39.6 % then 0 % |
| Scenes row with no light scenes (24 px at most) | 88 then 24 px | 88 then 24 px |
| Looks box, real bank | 1024x392 then 816x594 (+21 %) | 1342x393 then 1134x595 (+28 %) |
| first tile, real bank (before: worked out from the box width) | about 106 then 82.9 px | about 142 then 118.2 px |
| Edit, real bank | strip 1264x196 then column 440x469 | strip 1582x196 then column 440x470 |
| Edit empty share, nothing open (25 % at most), real / fresh | 76.4 / 76.0 then 40.5 / 41.2 % | 73.4 / 72.5 then 39.5 / 40.5 % |
| Edit empty share, a look open (25 % at most), real / fresh | 55.0 / 51.5 then 48.7 / 48.9 % | 57.1 / 53.6 then 48.3 / 48.2 % |

At 1280x700 (the size of his ring), real bank: overlaps 13 then 0, Edit empty 76.4 / 55.0 then 34.8 / 45.9 %, right column empty 29.8 % then 0 %. At 1239x771 (the strip): overlaps 0 at rest and open, 6 cubes included; the rail is 201 px empty under the Stage, as before (not a target at that size). Nothing drew over anything, in any shot of 8 opened.

**(Round 1) The target not met: Edit empty share, 25 % at most.** Measured 34.8 to 41.2 % with nothing open and 45.9 to 48.9 % with a look open. The largest empty rectangle is 440x40 with a look open (under the name row, where the 96x64 preview sits beside its note; whether the measure counts that canvas there is unchecked) and 72x168 with nothing open. Why: a label | slider | value row is 70 + about 80 + 52 px, and the glyph-box metric counts the label cell and the value cell beyond their text as empty; both plans' models put the floor for such rows at 36 to 42 %. Whether to restate the target ("no empty area bigger than one field row, about 290x24") is the owner's or the lead's call; by that reading the 440x40 band is still one row too many.

**The 1240 or 1400 gate**, set in advance and read at 1280x770 (the stage Mac's window), real bank: G1 overlaps in Edit 0 (text and control, rest and open, both banks, four sizes) held; G2 right column empty at most 15 %: 0 % held; G3 the Looks box with a look open at least 401,000 px2: 816x594 = 484,704 held; G4 first tile at least 80 px: 82.9 held; G5 Copy and Delete reachable by scrolling Edit at 1280x700: held (scroll 114 px with 1 cube, 198 px with 6). So 1240 stays; 1400 was not needed.

**Found while measuring** (both fixed in the build, both pinned): the help's row collapsed because the strip's `min-height: 0` still applied in the column (12 overlaps), and the masters needed 73 px inside their border and the 72 px box gave 70, so 3 px of their content were cut. Known-fixes has the first.

**Limits**
- Strip only (1000 to 1239 px): the 36 px value track still lets "0.125/b" touch the next label, and the sliders stay narrow (the plan's estimate was about 12 px at 1078 px wide; not re-measured in this build). This was so before and is not made worse.
- At 1240 px the first tile is 78.4 px wide (the gate reads 1280x770).
- From 1240 px the notice sits at the bottom left of the Looks while it shows.
- A tall window (about 900 px and up) leaves free height under Edit.
- `inert` is not used any more (addendum 2): Edit at rest is dimmed and `pointer-events: none`, and every control keeps its Tab stop.
- `measure-gaps.cjs`, `make-numbers.cjs`, `colour.py` and `check-after.cjs` live only in the reports folder; moving them into `scripts/` is owed.

**Undo:** revert the merge; or delete the nested `@media (min-width: 1240px)` block, the last thing in the Grid rules, to have the strip at every size again (the separate cells and the rest state stay).

## 2026-11-01 addendum 2: the findings on the first build, and what the second build did

**The findings** (a peer, on the first build; all reproduced): (1) Edit empty share over 25 %: 40.5 / 39.5 % (real bank) and 41.2 / 40.5 % (fresh bank) with nothing open, 48.7 / 48.3 and 48.9 / 48.2 % with a look open, at 1280x770 / 1598x771; (2) the fresh bank left a band under the last row of looks, 296 px = 44.9 % of the pane at 1598x771; (3) Edit needed an inner scroll with a look open, 44 / 43 px (real) and 128 / 127 px (fresh, 6 cubes); (4) `inert` took the 16 Edit controls out of the Tab order at rest; (5) the saturated share of the viewport had risen with a look open; (6) below 1240 px the right column is unchanged (39.6 % empty under the Stage); (7) the commit trailer named the wrong model.

**What the second build did** (the same Grid block, the nested 1240 px query; `desk.js` 4 lines; `index.html` one attribute):
- (1), (3): Edit is packed (known-fixes, "the Edit column scrolled"): a control row is 22 px (the range input's own 2 px margin was 4 px a row), label and value cells as wide as their words, a 72x48 preview with a one-line note, Picture beside Movement with Cubes and Copy / Delete under Movement, no gap between bands, the Shape chips and the slider rows share the height that is left, My colours is one wide + button when it holds none.
- (2): a small bank fills the Looks pane: the rows share the free height and each picture takes what its tile gets (known-fixes, "a small bank left an empty band").
- (4): `inert` is gone. Edit at rest is dimmed and `pointer-events: none`, so a mouse cannot reach a dead control, and every control keeps its Tab stop (fresh bank 160 at rest, 161 with a look open; real bank 214 and 215; Classic as before, 84 and 161, because it hides Edit at rest). The sliders at rest show the server's defaults for a new look (`desk.defaults`), so the dimmed panel has no empty value cells. An empty Edit is not scrolled: with 6 cubes its last row (Copy and Delete) is cut by about 25 px until a look opens.
- (7): the trailers are corrected in the commit (both models are named).
- The measure: `measure-gaps.cjs` had skipped the preview canvas (its wrapper is `display: contents` with `overflow: hidden`, and the clip code cut the canvas to nothing); fixed. The before numbers do not change (no such wrapper before).

**Numbers, first build then second** (real / fresh bank; the raw data and the method are in `numbers-after.md`, `numbers-after-extra.md`, `check-r2-real.json`, `check-r2-fresh.json`, `round1-after/`):

| measure (target) | 1280x770 | 1598x771 |
|---|---|---|
| Edit empty share, nothing open (25 % at most) | 40.5 / 41.2 then 23.9 / 25.2 % | 39.5 / 40.5 then 23.8 / 23.8 % |
| Edit empty share, a look open (25 % at most) | 48.7 / 48.9 then 21.8 / 24.4 % | 48.3 / 48.2 then 21.8 / 24.7 % |
| inner scroll of Edit with a look open (none) | 44 / 128 then 0 / 0 px | 43 / 127 then 0 / 0 px |
| band under the last row of looks, fresh bank (none) | 279 px (42.4 %) then 0 | 296 px (44.9 %) then 0 |
| overlaps in Edit, rest and open, both banks | 0 then 0 | 0 then 0 |
| right column empty under the Stage (15 % at most) | 0 % then 0 % | 0 % then 0 % |

At 1280x700 (his ring), real / fresh: Edit scrolls by 2 / 61 px with a look open and Copy and Delete end wholly inside (reached by the wheel); empty share 25.3 / 26.0 % open, 23.0 / 23.4 % at rest. Checked at nine sizes with the palette (+) open: in the flow, 0 intersections, Esc closes it, from 1240 px; the strip keeps its old docked palette below that. The masters and the follow switches are not clipped at any size from 1000x600 to 1920x1080; the Looks band is 0 at 1598x1000 and 1920x1080.

**Gate** (read at 1280x770, real bank, fresh in brackets): G1 overlaps in Edit 0 (text and control, rest and open): held; G2 right column empty at most 15 %: 0 %: held; G3 Looks box with a look open at least 401,000 px2: 816x594 = 484,704 (816x658): held; G4 first tile at least 80 px: 82.9 (84): held; G5 Copy and Delete reachable at 1280x700: held. 1240 stays.

**Not met, said plainly**
- Edit empty share, 25 % at most: seven of the eight readings are under it; the eighth is the fresh bank with nothing open at 1280x770, **25.2 %**. This layout's floor under the 8 px raster: rows of label | slider | value cost 25 to 40 % of their area (the label and value cells are mostly empty space around a word), the two group headings are text-only rows (about 2.5 points), and a shift of 1 px moves a reading by 0.3 to 1.5 points (the same layout read 25.0 to 25.9 % at name-field heights of 29 to 33 px). Restating the target as a band, or as "no empty area larger than one control row", is the lead's or the owner's call.
- Colour is not reduced. The tile pictures are the colour (by design, not touched), and with a small bank now filling the pane they are bigger, so their pixel share rose: fresh bank at 1598x771 0.82 then 1.58 % of the viewport at rest (95.6 % of it inside the tiles) and 1.48 then 2.53 % with a look open (37.8 % in the Edit palette); real bank 0.95 then 1.32 % and 1.62 then 2.28 %. Edit adds 0 at rest (grey swatches). A mode with muted tile pictures would answer the owner's words; it is his call and it is not built.
- Below 1240 px the column is the strip, as before: the right column is 201 px (39.6 %) empty under the Stage and the strip is 51 to 57 % empty at 1239x771. The owner's 1078 px portrait tab is in that range. Owed.
- At 1240 px the first tile is 78.4 px (real) and 79.5 px (fresh); the gate reads 1280x770.
- Not tested: the stage Mac's own browser, DPR 2, Firefox and Safari, a phone or touch, the light-scene select open, more than 6 cubes, live output. Not run: `npm run build`, the whole-repo tests, `verify:surfaces`. The words were checked by reading (there is no `tools/lint-words.sh` in this repo).
