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
- Blackout all: `POST ../light/api/master {blackout}` + `POST ../laser/desk/api/blackout {on}` at once, always both;
  the second press lifts both; a press inside 600 ms is ignored; lifting never arms
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
