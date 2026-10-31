# feat/laser-desk-2026-10-29 — the laser desk (Emily, 2026-10-29)

The owner's ask: "lets create laser soft like how is lighting one" — inside di ("inside di").

## What changed

- **The laser desk at `/laser/`** (`serverXR/src/laser/laserDesk.js`, page `serverXR/src/laser/ui/`): the light desk's twin for
  the LaserCubes. A bank of looks (tiles with their picture; Go, keys 1–9, drag to reorder), the live look edited on the cubes
  (shape or a cycle of shapes, colour or rainbow, size, height, across, rotation, copies, points, level; on the beat: spin in turns
  a beat, pulse, sweep, chase across the cubes, mirror; which cubes), Store / Save as new / Delete tile, master, BPM + tap,
  blackout, release, Disarm all on every page. Setup: the cubes in desk order, address and link, per-cube On (the engine's arm,
  phrase on the first On of a run), desk on/off, mirror, size, offset; Find cubes / Use these (the existing routes).
- **One more sender, the Out `desk`**: the server draws each cube's frame every 50 ms (setFrame when it changed, alive when not),
  like the show player. Nothing of the engine's safety moves: disarmed at start, phrase, zone, galvo/still-beam guards, signal-loss
  stop, one Out per cube (a held cube refuses the desk; Setup and Stage say so). Released at every start; the bank, clock and setup
  are kept in `<data>/laser/desk.json` (atomic write; an unreadable file is kept as `desk.json.bad`).
- **The engine's Blackout wins**: POST /laser/api/blackout (from any page) clears every frame; the desk sees a cube it sent to
  holding nothing and goes to its own blackout (lit on the page, kept until pressed again) instead of drawing straight back.
  A config reload (Use these, a new engine) is the other case of "no frames": there the desk sends everything again.
- **The Laser node's shapes have one source**: `shared/laserShapes.cjs` (moved from `src/project/nodes/laser.shape/laserShapes.js`,
  which now re-exports the generated twin `src/shared/laserShapes.js`). `scripts/laser/laser-frame-twin.mjs` writes both twins.
- Routes: 14 under `/laser/desk/api/*` + the page (`routes/laserRoutes.js`), catalogued in `catalogue/entries/laser.js`.
  Writes behind requireOwnPage + requireSameMachine; release and blackout take the stops' gate (STOPS_FROM_REMOTE).
- **One cube** (the owner's next event has one LaserCube): with one cube the page drops Mirror, Chase, the look's cube
  picker and the Place column (`.one-cube .multi`), the stage is one big picture, and the words say "the laser". A one-cube
  rehearsal is a laser.json with one cube and no address (sim); Find cubes / Use these puts the real one in.
- **Minimal and sparkle shapes** (the owner, later the same day: "more minimalistic shapes an sparkle shapes"), in
  `shared/laserShapes.cjs`, so the Laser node gets them too (21 shapes, appended): arc, cross, bars, rings, corners,
  chevron; glint (one ✦, an astroid), sparkle (✦ marks, each wholly inside its own slice of the circle so none ever touch;
  one jumps every half beat, in turn) and twinkle (✦ marks on fixed sunflower places, a new half lit every half beat).
  Marks appear and go whole, no fade (the owner's raw-shape rule). Places come from an integer hash, never Math.random,
  so server, twin and tiles agree. `generateShape` takes an optional `beat` (the desk passes its clock; default time × 2).
  Six seed looks (Sparkle, Twinkle, Glint, Ripple, Corners, Cross) for a bank with no desk.json yet.
- **The sparkles' floor**: a mark is ≥ 0.16 of the picture, so from size `MARK_MIN_SIZE` 0.15 every mark is a stroke to the
  still-beam guard; at 0.05 the frame is dots only and the engine blanks the cube until it grows (it resumes on its own).
  The every-shape still tests hold `MARK_SHAPES` at 0.5 and 0.15 instead of 0.05; the headroom numbers the 50 % share was
  chosen on stay pinned to the first twelve shapes, and the new ones have their own (figures 7.3 / 16.3 / 32.0 %, the bars
  the worst at 0.5; sparkles 4.1 / 7.7 %).
- **Animations** (the owner: "cant see animations okay add animations of 5 vertcal lines, and to many spots, wobbling
  lines as well"): lines (5 upright lines swinging in their lanes, a ripple through them every 2 beats), spots (10 small
  rings — a dot is a still beam — on a honeycomb 0.36 apart, gliding eased to new places in the first half of every beat;
  `MARK_SHAPES`, floor 0.15) and wobble (3 lines held at their ends, a wave running along them). 24 shapes; seed looks
  Lines, Spots, Wobble.
- **The bank's tiles play their looks.** The look drawing (`lookPointsAt`, `beatsAt`, `CUBE_DEFAULTS`) moved from
  laserDesk.js to `shared/laserLook.cjs` (+ `lookBox`, the fixed frame a tile shows so pulse and sweep stay visible);
  `GET /laser/lib/laser.js` serves shared/laserFrame + laserShapes + laserLook as one plain script (each wrapped as a
  CommonJS module, `window.DiLaser`) — the page has no bundler, and installs ship shared/ (pack-runtime.mjs). desk.js
  draws every tile every 50 ms on the desk's clock (synced from `state.beat` at each poll); without the script it keeps
  the server's still thumbs.
- **New seed looks reach a saved bank**: desk.json keeps `seeded` (the seed ids it has been offered); a bank without it
  counts the first fourteen as offered. A seed added later joins the end once; one the owner deleted is not re-offered.
  Found because the scratch desk had saved desk.json and never showed the new looks.
- **Tiles are clips, as in Resolume** (the owner: "change some shapes see results then plaay and send signal to laser";
  a Preview + ▶ Send + Live-switch version, 7d1c5a789, was "bad idea" — "like in resolume when we will click on the down
  part of pattern look like in name its will be preview when on the shape its will go to laser and keep changes for each
  scene qand add save bottom"). A tile is two buttons: its PICTURE sends the look to the laser (`go`; keys 1–9 too), its
  NAME opens it in Edit, drawn on a Preview above the controls (lib/laser.js, the first cube's field). An edit changes
  that look in the bank (`POST /laser/desk/api/looks/edit { id, …fields }`): every look keeps its own changes, and the
  look on the laser shows each change at once, like a playing clip. Bank changes (edit, copy, rename, delete, order)
  set `unsaved` and wait for **Save** (top bar, Ctrl+S, `POST /laser/desk/api/save`); any other write (BPM, master,
  setup) and a clean stop write them too. Copy (`looks/copy`) puts a copy after the look. `send` is gone; `store` keeps
  its `{ look }` option.
- **Save makes a new scene** (2026-10-30, the owner: "it will be saved like new scene"; picked over "two buttons" and
  "same tile"): a look whose picture changed since the last Save becomes a NEW tile at the end ("Star 2", "Star 3", or
  the name it was given), and the look goes back to how it was saved; a new name alone renames in place; copies are new
  already. The desk keeps `savedLooks` (what desk.json holds): writes for BPM, master and setup write that, never an
  unsaved edit. A look on the cubes that became a new scene is that scene now (`liveId` moves); the page's Edit follows
  it too (`created` in the answer). State has `changed` and `added`; their tiles show a dot after the name.
- **Keys** (2026-10-30, the owner: "add delete ctl z ctrl v ctrl c and other shortkeys and do immitation and debug them"):
  1–9 / Enter send (Enter: the look in Edit, also from a focused tile), arrows walk the bank by its layout (focus follows),
  Ctrl+C / Ctrl+V as copy/paste events carrying `{ kind: 'di-laser-look', look }` text (pastes into another tab; no
  clipboard permission needed), Ctrl+D duplicate, Delete (and the Edit button, one click now), Ctrl+Z / Ctrl+Y /
  Ctrl+Shift+Z, Ctrl+S, F2 (also from a slider), Esc (out of the name, then closes Edit), B, T, ? (the list). A text field
  keeps its own keys. **Undo is the desk's** (`POST /laser/desk/api/undo|redo`, `looks/paste`): the bank before each change,
  100 steps, edits to one look within 1.5 s joined (a slider drag = one step); the look on the cubes follows an undo;
  `canUndo`/`canRedo` in state light ↶ ↷. Simulated in headless Chrome (scratch `keys-sim.cjs`, 30 checks): the first
  runs found Enter re-clicking the focused name button, F2 dead while a slider had focus, Esc dead in the name field,
  undo not moving a focused slider back, and Edit reopening after Esc (the poll re-selected the live look); all fixed.
- **Colours** (2026-10-31, the owner: "on colos add color paleete and have new colors there as well"): 17 named swatches
  (the hue wheel + white + warm white; green pickable, still no seed's colour) beside the picker, and **My colours**: + keeps
  the colour of the look in Edit, × takes one out; `POST /laser/desk/api/palette { colours }` (whole list, each once,
  `#rrggbb`, ≤ 24), kept in desk.json `palette`, not an undo step. Simulated in headless Chrome (17 checks, desktop + phone).
  Then ("no i eed paleet choose from colors paleet show me color pallet when +"): + opens a palette (12 hues × 5 shades
  pale→deep from HSV, + 12 whites/greys; a picker and a #hex field below); a choice is kept in My colours and the palette
  closes; the look is not changed (clicking the kept swatch colours it). Esc / Close shut it. 16 headless checks.
- Wiki `laser-desk`; eslint gives `serverXR/src/laser/ui` browser globals like the light desk's ui.

## Tested

- `npx vitest run src/laser` (cwd serverXR): the desk's 21 + the laser suites. `laserShutdownContracts.test.js` SIGTERM/SIGINT
  fail the same 2 on clean dev on Windows (baseline, not this change).
- `src/shared/laserShapes.test.js`: server and browser draw all 12 shapes identically; the node's import path still works.
- Headless Chrome (channel chrome) on a scratch serverXR (:4390, throwaway DATA_ROOT, sim cubes): desktop 1646×900 and phone
  390×844 — Go, edit (shape, colour, spin, chase) and the poll agreeing after the hold, Setup, the phrase box (cancelled). 0 console
  errors. Found and fixed on the way: `display:grid` beat `[hidden]` (Setup drawn under Control), chips rebuilt by every poll (a
  click landed on a replaced button), panes shrinking on the phone.
- Cost, measured in-process (PONYO): a moving look on 6 sim cubes 5–17 ms a 50 ms tick; ~2.4 ms of each new cube frame is the
  engine's own guard work (the same the show player pays when tweening). A still look is keep-alives only.

- The new shapes: measured as the desk sends them (flattened, zone, optimised at 30 and 35 kpps) over 80 half beats ×
  3 turns × 3 point counts: sparkle and twinkle never still from size 0.12 up, still sometimes at 0.1, always at 0.05;
  the other new shapes never still down to 0.05. At 1992 points every new shape fits the real cube's 2333-point budget
  (corners the most, 2179). Tests: strokes, exact corners/tips, one sparkle jump per half beat, twinkle's fixed places,
  no two marks touching (sparkle 1–12, twinkle 1–10, 200 half beats), the desk's half beats at 60 and 128 BPM, the
  flattened sparkles' floor. Headless Chrome on a scratch desk (:4391, one sim cube), desktop + phone: 21 chips and 20 tiles
  wrap, every new shape on the stage, 0 console errors. The first twinkle overlapped two stars (a 0.6 rad jitter on the
  sunflower places) and the first sparkle overlapped in half its half beats: fixed before anything shipped.
- The animations: never still down to 0.05 (lines, wobble) or from 0.15 (spots, as sent); 300 points draw at 62 fps
  (lines), 76 (wobble), 48 (10 spots) at 35 kpps. Tests: lines never cross and repeat every 2 beats, spots rest and glide
  with no jump at the beat and keep half a spot apart at rest, wobble's ends fixed and lines never meet, the served
  lib/laser.js draws every seed look exactly as the server (vm), the seeded merge. Headless Chrome, desktop + phone:
  22 of 23 tiles change in 0.4 s (Grid has no movement), lib loaded, 0 console errors. The first spots sat 0.3 apart and
  read as a clump: spread to 0.36, 10 by default.

- CI on #1218 (first push): shard 3 and node-22-compat failed one test, `src/raw/rawTestScope.test.js` — the new
  `src/shared/laserShapes.test.js` imported the node (`../project/…`), so it reached the node graph from outside
  `test:raw`. The node's import-path check moved to `src/project/nodes/laser.shape/laserShapes.test.js`. It passed
  unseen locally because on Windows that guard always fails (backslash paths list a dozen files), which hid the new one.
  Rule: on Windows, read rawTestScope's list, don't trust its red/green.

## Not tested

- Nothing on a real cube; nothing armed (sim included). The desk on the wall is owed, with the officer.
- Phone over the LAN (needs DI_ALLOW_LAN_DEVICES=1, as for Laser Out).
