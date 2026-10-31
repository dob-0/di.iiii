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
