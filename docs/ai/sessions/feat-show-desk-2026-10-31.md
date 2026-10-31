# Show desk: the lighting desk and the laser desk on one page (ledger N1614, N1614.1), 2026-10-31

## What it does

A new page at `/serverXR/show/` (title "Show desk") for the person who runs a show, one screen with no page scroll at
1278x758: the top line (the scene on the lights, the look on the laser, Laser On/Off) with Blackout all at the far right;
Scenes (the lighting desk's scenes in its order, the look that follows each, its lamps' colours); Lights (a fader and a
live colour per patched lamp, Master, Release holds (N)); Laser (per cube On, Off, Size and a calm preview; Master; the
live look); links to the full Laser desk and Light desk. Any patch, any number of cubes, any scene list; a missing half
says so in plain words. No production name in code, defaults or test expectations.

## Routes (only the two desks' own; same origin, so their guards apply)

- Scene: `POST ../light/api/scenes/recall {id}` then `POST ../laser/desk/api/go {look}` (laser/ui/sceneRow.js pressScene)
- Blackout all and the B key: `POST ../light/api/master {blackout:true}` + `POST ../laser/desk/api/blackout {on:true}` at
  once, always both, on every press; never a lift (fix 1 below). A press while a lift is in flight goes dark again once
  that lift has landed, so B always wins.
- Lift blackout, one per desk at the head of its half (fix 2): lights `POST ../light/api/master {blackout:false}` (the
  lighting desk's own Blackout off), laser `POST ../laser/desk/api/blackout {on:false}` (the laser desk's Shift+B,
  desk.js:922). Shift+B lifts each one. Only a desk that answered its last state read AND reports its blackout on;
  600 ms gap per desk; lifting never arms.
- Lamp fader: `POST ../light/api/fixture {id, values:{dimmer}, on:true}` (the lighting desk's setRole), 50 ms throttle
- Light master: `POST ../light/api/master {master}` · Release holds: `POST ../light/api/raw {clear, universe}`;
  Release all holds (shown only when a script holds channels): `{clear, all:true, universe}`
- On / Off: `POST ../laser/api/arm {armed, cube, out:'desk'}` (one cube, a press only; phrase mode points to the Laser desk)
- Size: `POST ../laser/desk/api/cube {id, size}` · Laser master: `POST ../laser/desk/api/master {level}`
- Reads: light `api/state`, laser `desk/api/state` + `api/state` once a second; `desk/api/follows` every 20th poll;
  `desk/api/view` 500 ms while every cube is Off, 80 ms while one is On; all paused while hidden

## Where it lives

`serverXR/src/showDesk/ui/` (index.html, show.css on top of ../laser/desk.css, show.js), `routes/showDeskRoutes.js`
(files only, requireLocalRuntime; base path only), catalogue `entries/showDesk.js` (GET /show), wiki `show-desk`,
`lighting/ui/colour.js` exports `EMITTER_MIX`/`mixOf` (equal to app.js's table, guarded). Tests:
`serverXR/src/showDesk/showDesk.test.js` (23), `routes/showDeskRoutes.test.js` (3); the copy-words test reads the page.

## Measured (agent screen, 1278x758 CSS px, scale 2, scratch serverXR seeded from the Mac's light state and 72 looks)

scrollHeight 758, scrollWidth 1278, last element bottom 758, right 1278; rows 0-60-90-266-724-758; no button or fader
under 40 px; 0 console errors. Shots: ~/work/agent-reports-2026-10-31/projector-room/show-desk/ (rest, after a scene
press, Blackout all on). Scratch light output was off (output.enabled false) and the cube had no address (sim).

## Limits

Not seen on the stage Mac's Chromium, over remote desktop, or with a real cube (scratch only; no pack, no install).
The word: "Show desk" (vocabulary: Light is "the lighting desk"; a show is "played on a clock or a desk"); not "show
page", which is `/{space}/show/…`; "workspace" is banned.

## Review (learn once)

A bash heredoc overwrote the tracked `serverXR/src/routes/showRoutes.js` (the space show page's routes); restored from
HEAD in the next call, no loss. Lesson: new files through the Write tool (it refuses an unread file) or
`git ls-files --error-unmatch <path>` first. A scratch serverXR's lighting desk broadcasts Art-Net once built unless its
show.json says output.enabled false: owed, a scratch default (ARTNET_OFFLINE=1 in di-dev --api scratch).

## Fixes after the 3-lens review (same day, 18:2x-18:5x; branch head was 3fcf3d3df)

The review (safety-routes, design-words, operator-look) said "not to install" until four things were fixed. Built exactly:

1. **Blackout all is one-way** (show.js pressBlackout). It only ever sends the two dark POSTs, on every press, so a panic
   re-press after 0.6 s can no longer lift both. Why: the old toggle relit the lamps on a re-press, and with the laser
   desk's "Blackout keeps the arm" ticked the review measured 19406 lit points in the next second from the lift alone.
   The laser desk's own Blackout is one-way for the same reason (desk.js:171-173, review 1218 M1). Dark is never gapped:
   a panic retry is never dropped (the laser desk's review D4).
2. **Lifting is separate and per desk** (index.html #liftLights / #liftLaser, show.js pressLift). Each sits at the head
   of its own half, far from Blackout all (measured: lifts at x 81 and x 711, y 283; Blackout all at x 1048, y 8). A lift
   is enabled and sent only for a desk that answered its last state read and reports its blackout on, so a desk whose
   read failed is never lifted (the old press lifted both even when one had not answered). Each uses its desk's own
   route and body; 600 ms gap per desk.
3. **The panic key** (show.js keydown): B = Blackout all, dark only; Shift+B = lift each desk that answered and is dark.
   A text field keeps B (the laser desk's `typing` rule, desk.js:885); `e.repeat` is ignored; the gap guards the lift only.
4. **Square faders** (show.css): the lighting desk's slider rule in tokens: no native look, track 6 px `--field` with a
   1 px `--line` border, thumb 22 px x `--target`, radius 0, `--text`, the WebKit thumb centred on the track.

Also: the wiki's Show desk paragraph described the old toggle; it now says the above (src/wiki/wikiContent.js).

Tests: `showDesk.test.js` replaces the "second press lifts both" test with: any number of Blackout all / B presses
never send `{blackout:false}` or `{on:false}` (20 POSTs, all dark); each desk lifts alone, only when it answered and is
dark; a desk whose state read failed is never lifted (button or Shift+B, even with the button forced enabled); B, Shift+B,
a text field, auto-repeat and the 600 ms lift gap; B during a lift in flight ends dark; both thumb rules say radius 0.
`npx vitest run serverXR/src/showDesk serverXR/src/laser serverXR/src/httpContracts.test.js serverXR/src/catalogue`:
24 files, 513 passed. `npx vitest run src/wiki`: 3 files, 27 passed. eslint on the changed files: 0 problems.

Seen (agent screen lane 2, 1278x758 @2x, scratch serverXR at its own address, light output off, one cube with no
address): at rest both lifts are disabled; after Blackout all both desks read dark by GET and both lifts are enabled;
Lift on the lights lifted the lights only; B made both dark; Blackout all pressed again after 800 ms kept both dark;
Shift+B lifted both. No page scroll, no target under 40 px, 0 console errors. Shots and numbers:
~/work/agent-reports-2026-10-31/projector-room/show-fix/.

Owed (should-fix from the review, not done here): stale status words for up to 12 s after an outside blackout change;
On stays enabled on a Stopped cube; no busy flag on On, Off, the Release buttons and a scene re-press; one integration
test with the real routers; the bare /show mount when no base path is set; the vocabulary row for "Show desk"; Light
desk vs "the lighting desk" naming; no link into the Show desk; small 10-11 px text in the states that matter; Blackout
all should be the loudest thing while a cube is On; the white "on" fill is harsh in the dark; the three links under 40 px;
more cubes, lamps and scenes than fit; a known-fixes entry for the toggle. Seen on this run: the laser Master fader gets
shorter while " · blackout on" shows beside the look name (the look name is not fixed width; it was so before too).


## 19:40-20:15 · the live version (owner 19:2x: "where to edit scenes real time"; 19:3x "we come from TouchDesigner"; 19:5x touch, dots)

Built on 3ea40f800, in `serverXR/src/showDesk/ui/{index.html,show.js,show.css}`, `ui/midi/{xone-k2.json,README.md}`,
`showDesk.test.js`, the wiki article `show-desk`:
- Layout "Console" (underground/ui-1): top line (title, what is on, status + unsaved state; Blackout all 283x56 at the right
  with Lift lights / Lift laser under it), one row of scene keys numbered 00.., the live strip, one fader bank (upright
  lamp faders with colour swatches under them, Lights master with Release holds, Laser master, per cube Size + preview + On/Off),
  the links + MIDI line. Every control and safety rule of 3ea40f800 is kept (all its tests pass unchanged in meaning; the
  layout tests were rewritten for the new rows, the lifts test now pins the lifts under Blackout all and never in the bank).
- Live strip (touch-first): colour pads 56 px (laser desk SWATCHES + #e0001a #f0eaff #7a20ff), Rainbow, shape pads
  (spots first), effect pads Pulse/Sweep/Spin/Cycle (tap off, tap again on at the last depth) with depth faders, Mirror,
  faders for level, size, copies, rotation, phase, pulseBeats, sweepBeats, points, BPM + Tap, an XY pad (x, height).
  Routes: `../laser/desk/api/looks/edit {id: liveId, field}` (per field <= 1 per 60 ms, last wins, never without a live
  look), `../laser/desk/api/bpm {bpm}|{tap:true}`; lamp swatches `../light/api/fixture {id, values:{r,g,b,(other emitters 0)}, on:true}`.
- Save scene = `../light/api/scenes/update {id: lit scene, restage: true}` + `../laser/desk/api/store {id: liveId, look}`
  (NOT desk/api/save: it copies a changed look to "<name> 2" and moves the live id off the scene link; lead's correction).
  The lit scene is kept by the page, because the lighting desk's POST /api/fixture clears its activeScene (desk.js:1680).
  Undo = `../laser/desk/api/undo` + `../light/api/scenes/recall {id: lit scene}`. Status: "unsaved changes" from the laser
  desk's `unsaved`; "lamps: saved on Save scene" (the lighting desk has no unsaved flag for scenes).
- MIDI (Web MIDI in the page): default K2 map (see ui/midi/README.md), pick-up for faders/pots, relative encoders step from
  the screen value, Learn (tap Learn, tap a target, move a control; localStorage), Export map. MIDI_OK is the whitelist of
  targets; On/Off/lifts/Undo/Save/Release are not in it, and a stored map is read through it.
- Tests: `npx vitest run serverXR/src/showDesk` -> 47 passed; the brief's set -> see the report. Not tested: a real K2,
  the stage machine, Chromium's MIDI permission prompt there.

## Space pass (20:2x-20:4x; the owner on the 7fc2aa974 picture: "UI ok, but some things there are huge; you can optimize to use the space right")

Layout and sizes only (`ui/show.css`), no logic, no route, no control added or removed. Measured on the agent screen
(lane 2) at 1278x758 and 1920x1080, scratch serverXR (`di-dev up show --api scratch`) seeded with the 19:57 saved light
state (3 lamps, 10 scenes, output.enabled set false); the scratch laser desk had 6 cubes and no MUTH looks.
Shots and numbers: ~/work/agent-reports-2026-10-31/projector-room/show-space/ (1-rest-1278, 2-after-scene-1278, 3-1920, measure.json).

| What | Before (7fc2aa974) | After |
|---|---|---|
| Fader thumbs | live strip 44x44, bank 44x22 | 44x22 on every fader (lying: 44 along the travel, rows 34; upright: 44 across) |
| Colour pads | 56 px, gap 4 | 40x40, gap 4, one row |
| Lamp colours | 4x3 grid of 44 px per lamp | 32 px in two rows (6+5) per lamp (brief's fallback, see below) |
| Scene keys | min 112 px, name cut, row scrolled | 117x70 at 1278: number, full name (12 px, two lines at most), look; scrollWidth 1206 = clientWidth, 0 names cut |
| Shapes | one row of 44 px, scrolled | two rows of 36 px, 13 px text, spots · dots first; scrollWidth 1054 = clientWidth |
| Effects + knobs | three flex rows | one grid of five equal columns (208 px at 1278, 336 at 1920); values right-aligned, one edge |
| Lamp fader travel | ~80 px | 142 px at 1278, 464 at 1920 |
| Preview / Size strip | ~216x169 (flex) / 76 px | 166x125 (4:3) / 56 px |
| Lifts | 4 px under Blackout all | beside it, 24 px clear (measured 24 and 24); Blackout all 283x56 -> 220x91 |
| Rows | 104 / 72 / 250 / >=260 / 48 | 100 / 80 / 238 / >=260 (294 at 1278) / 46; page scroll = viewport at both sizes |

Choices: the shared palette (last-touched lamp) was not built: selecting a lamp by touching its fader can move its level,
and it is new logic on show night; the per-lamp 32 px pads are the brief's fallback. The brief's "22 wide, 44 tall on
upright faders" was read as the lighting desk's turned cap (`lighting/ui/style.css` .vwrap 18x26 before its turn); on
the screen the upright caps stay 44 wide x 22 tall (a 44-tall cap costs 22 px of travel on every lamp fader).
Limits: the lamp swatches (32x32) are under the 44-in-one-direction rule; at 1920 each cube card keeps ~390 px of pane
under On/Off (6 scratch cubes, cards do not widen; with the show's 2 cubes they widen); the "rest" shot shows the scene
the first run pressed (the scratch desk kept it). Tests: `npx vitest run serverXR/src/showDesk serverXR/src/httpContracts.test.js`
-> 146 passed (one new: the lifts stand 24 px clear of Blackout all); eslint exit 0.

## Touch · Compact, the desk switch, one top line, small caps (2026-10-31 20:55–21:45, Opus agent for dob-fa)
The owner at the stage Mac (1280 x 800 with a mouse; the browser window is ~1280 x 700): "fix the UI, it is huge … it's
not the touch screen"; 21:0x "add buttons so I can easily go from one desk to the other"; 21:1x the top part "uses the
space badly"; 21:2x the sliders "why so ugly".
- Two densities, nothing lost: Touch (the hand sizes) and Compact (`body[data-density="compact"]`, one block of tokens at
  the end of show.css). The switch "Touch · Compact" sits in the bottom line before the MIDI line; the choice is kept per
  browser (`diShowDesk.density.v1`); until one is made, `(pointer: fine)` and no `(any-pointer: coarse)` means Compact.
- "Show · Light · Laser" (class `deskswitch`) after the mark: plain links ./ ../light/ ../laser/, Show marked
  aria-current="page"; 44 tall in Touch, 28 in Compact. The bottom links stay.
- The top part is one line: Touch 64, Compact 48. Blackout all 160x44 / 140x36 (one line; its colour and weight kept);
  the lifts side by side 100x32 / 90x28, 24 px clear of it in both. "Show desk" stays as the h1 for screen readers; the
  scene row is labelled "Scenes", its explainer is the row's title (#scenesNote kept for screen readers).
- Faders: tracks 4 / 3 px in var(--line); caps 24x14 lying, 14x24 upright / 16x10, 10x16; caps muted, var(--text) only in
  the live strip while a look is live; the inputs stay the hit area, 32 / 20 tall.

Measured on the agent screen (lane 2; scratch serverXR seeded with the 19:57 light state: 3 lamps, 10 scenes,
output.enabled false); numbers in agent-reports-2026-10-31/projector-room/show-compact/measure.json; CSS px:

| | Touch | Compact |
|---|---|---|
| rows at 1278x758 | 64/80/238/330/46 = 758 | 48/62/182/296/32 = 620, air below |
| 1280x700 (the stage window) | fits, bottom line ends at 700 | fits, bottom line ends at 620 |
| scene keys | 117x70, 0 names cut | 117x52, number + name on one line, 10 of 10 names cut (…) |
| colour pads, lamp pads | 40, 32 | 26, 22 in 2 rows |
| shapes | 2 rows of 36, 13 px | 2 rows of 26, 12 px, no scrollbar |
| effect pads, knob rows | 76x34 at 14 px, 34 | 76x26 at 12 px, 26 |
| lamp fader (1278x758) | 44x200 | 22x186; the two masters 44 wide in both |
| preview | 166x125 | 132x100 |
| Blackout all, lifts, gap | 160x44, 100x32, 24 | 140x36, 90x28, 24 |
| smallest control | the di.iiii mark 71x25 | the lying faders 128x20; 0 under 22 px in both directions |

"masters 44 wide" was read as the master faders (44 in both densities); their strips stay 96, because 44-wide strips
cut "Lights", "Laser" and "Release holds (0)". `--master-w: 44px` in the Compact block builds the other reading.
Open: at 1280 the one-line top cuts the scene and look names (Touch "MUTH…", Compact "MUTH 05 …"); Compact scene keys
cut every name; "Sweep beats" is cut at 12 px; not seen on the stage Mac's Chromium; no touch screen tried.
Tests: `npx vitest run serverXR/src/showDesk serverXR/src/httpContracts.test.js` -> Tests 153 passed (153); eslint 0.

## Two pages, one state (21:2x: "my desk here and the Arch desk are not synced")
show.js already reads both desks every 1 s (`POLL_MS = 1000`, show.js:23, while the page is visible) and redraws scenes,
the live look, lamps and status from it, so the poll rate is not the cause. Changed: `HOLD_MS` 1500 -> 1000 (a held fader
follows the poll 1 s after it is let go). Test: a change on the fake server shows within 2.5 s with no press.
Open hypotheses for the two machines: the other page hidden (the poll pauses while `document.hidden`); the two pages on
two different servers (aylmo's own di vs the stage Mac); a guard refusing the other machine's reads.

## Rows · Upright: the fader bank as rows (2026-10-31 22:3x-23:5x, branch feat/show-desk-gaps-2026-10-31 from c19a83534)
The owner at 22:0x: "update the UI, fix all gaps, look: the faders area is not used right". Method: an audit of the page with its own
instrument (nine gaps), two designs (Rows, Tiles), a judge; Rows won, with Tiles' colour monitor grafted at row size. Reports:
agent-reports-2026-10-31/projector-room/show-gaps/ (audit.md, design-lamps-as-rows.md, judge/judge.md, build/, REPORT.md).
- Rows (default): one lamp = one row (colour tab, name and patch line, a lying level fader, the level, 11 colour pads); the two masters
  are two short lying faders at the right of the rows; the cubes are one line under them, one card each (name and state, picture,
  On and Off, a lying Size fader). No element moved: grid placement only (`.bankpart { display: contents }`), so `show.js` render code,
  ids and `data-midi` are as they were. Compact 1280x700: 44 | 62 | 182 | 380 | 32 = 700; Touch: 56 | 80 | 238 | 280 | 46 = 700.
- Upright (the console posture, chosen at the 20:2x space pass): the same page with `body[data-bank="upright"]`; a Rows · Upright
  switch in the bottom line before Touch · Compact, kept per browser in `diShowDesk.bank.v1`. Every Upright rule stays in show.css
  untouched (a test asserts it). Undo of the default: the Upright button, or `data-bank="upright"` on the body in index.html.
- The audit's gaps closed: the dead band under the bottom line (`--bank-max` 1fr in Compact too), the lamp card holes, the cube strip
  cut off, the masters' side air, the colour pads' side air, the Live strip's colours row, the bottom line's right end (the new switch),
  the top line's slack (56 / 44 tall; Blackout all 48 / 40, lifts 40 / 34). Partly: the air under the cube name (kept for the stop text).
- The lamp's swatch is a 22 px tab as high as its row (graft from Tiles; the colour logic is show.js's, no brightness filter).

Measured with the audit's own script (measure-show-desk.cjs, headless Chromium, the harness with the seeded 3 lamps, 10 scenes, 2 cubes),
base c19a83534 against this build, CSS px, Compact 1280x700 | Touch 1280x700 | Compact 1278x758 | Touch 1278x758:

| | before | after |
|---|---|---|
| empty share of the whole screen, A | 58.3 / 42.6 / 61.5 / 45.1 % | 40.8 / 35.6 / 43.8 / 37.7 % |
| dead band under the bottom line | 80 / 0 / 138 / 0 | 0 / 0 / 0 / 0 |
| cube strip overflow (the 2 cubes) | 30 / 98 / 32 / 100 | 0 / 0 / 0 / 0 |
| fader bank empty share, A | 69.8 / 57.4 / 69.8 / 60.7 % | 47.9 / 46.9 / 52.2 / 49.6 % |

By the instrument's own definition a small mark is up to 48 px; the Compact tab (22 x 54) is not one, so it counts the tab as empty (Compact is 0.2 point above the design's 40.6; Touch, a 22 x 38 tab, is 0.1 under).
DOM rects of the build, four screens: no page scroll, no inner scroller, 0 overlaps between controls, 0 controls under 22 px in both
directions, 0 card children outside or cut, 0 console and page errors; 136 controls against 134, none missing, only the two new Rows and
Upright buttons added, every control 100 % visible. Controls with one side under 22 px: the 13 lying faders of the Live strip, 128 x 20 in Compact, the same 13 at c19a83534. The page needs
636 px in Compact (was 620, summed from the base tokens) and 688 in Touch (was 688): at 1280x636 and 1280x688 the bank is 316 and 268
high, 0 problems.

Found and fixed while building (states the audit never shows; probes in build/):
- "Release all holds" shown: the Lights label was cut to 34.7 px ("Lig…", Touch 37.3) and both hold buttons overflowed. Cause: a grid track
  that holds an `overflow: hidden` item starts at 0 (docs/ai/known-fixes.md). Now 70.3 x 29.9 (Touch 73 x 29.9), buttons 77.5 x 30 (80.1 x 32).
- 3 cubes or more: the cube line scrolls sideways and its scrollbar takes 15 px of its height, but the picture was sized from the line
  (`100cqh` ignores the scrollbar), so it was 152 px in a 149 px card (Touch 100 in 97), cut at both ends. The card is now the size
  container: the picture is 180.8 x 137 (Touch 113.3 x 85); with 2 cubes it is as before, 200.6 x 152 (133.3 x 100).
- 5 lamps, 3 cubes and a stopped cube in Touch (the stop text is three lines): the card needs 109 px of its 95; it scrolls inside itself
  (`align-content: safe center`), nothing is cut off. 5 lamps: the list scrolls inside itself (336 in 200 Compact, 256 in 152 Touch).

Costs of Rows, said to the owner: Rows is the default because his 22:0x ask is the word; Compact needs 636 px (was 620); the Size fader is
181 px long in Compact (was 214.6); the Touch cube picture is 133 x 100 (was 166 x 124.5); lamps beyond three scroll inside their list.
Not seen: the stage Mac's browser, a touch screen, a real MIDI controller on a lying fader, real cubes, the owner; browsers older than
Chromium 105 (container query units, `:has()`, `display: contents`) have only the fallback heights.
Lights and laser: no scene, colour, palette or look changed; both halves were arranged in the same job and measured on one page.
Tests: `npx vitest run serverXR/src/showDesk serverXR/src/httpContracts.test.js` -> Tests 159 passed (159) (showDesk.test.js 57 -> 61: the
switch, the stored choice and a throwing storage, nothing lost / every Rows rule scoped, the rows fit and the grid areas); eslint exit 0.
Owed: the layout gate (measure-show-desk.cjs, gate.cjs, the harness) lives only in the agent-reports folder; it moves into scripts/ as a
repo tool (ledger row, owner: the next show-desk job); a look on the stage Mac's own browser.
