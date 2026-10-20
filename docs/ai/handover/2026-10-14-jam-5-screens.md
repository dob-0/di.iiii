# Jam 5 screens (ledger N647.4), 2026-10-14

Project: space `di-laser`, project id `jam-5-screens`, private, made on the installed di (no code, no hand edits; the editor's own ops via POST /serverXR/api/projects/jam-5-screens/ops).
- Desk (edit, cues): http://diiii.localhost/di-laser/map/jam-5-screens
- Output (the picture for the 3200x1440 display): http://diiii.localhost/di-laser/map/jam-5-screens/out
- Test-pattern screenshot (agent screen, viewport 3200x1440, 5 iframes loaded, page title "out · jam-5-screens · ok"): ~/work/agent-reports-2026-10-14/jam-5-screens-test-pattern.png (seen: numbers 1-5 in order, no overlap, each iframe measured 640x1440 @1x).

## What di offers (read on origin/dev)
- /map = mapping document in a project: `mappingState.output {width,height}`, surfaces (corner-pin, polygon mask, own resolution, opacity/blend), cues (a cue sets per-surface enabled/opacity/source, keys 1-9, fade), `output.show` (which machine+screen shows it), source kinds: project, url, video, image, colour, test, camera, network (Raw Picture Out), stream (named capture/virtual camera), ndi.
- /out page: black, no chrome, wake lock (screen stays awake), "Full screen" button plus one button per display (Chromium Window Management API, asks permission once). The picture keeps the mapping aspect (3200:1440) inside the window.
- Raw Out/stream nodes: reach the map through source `network` (Picture Out) or `stream`. `di ndi get` = NDI in/out (source `ndi`, name matched on the machine that shows it). `di stage join` makes a machine a kiosk (needs di + follow of the space).

## How it was built
(a) output 3200x1440; surfaces scr1..scr5, each resolution 640x1440, corners x = 0,.2,.4,.6,.8 .. (n/5), i.e. 0/640/1280/1920/2560 px. Plus surface `live` (3200x1440, full width, disabled).
(b) Test pattern = a `url` source per screen whose ref is a self-contained `data:text/html` page: big number, colour (red/orange/green/blue/purple), 1-px border, 80-px grid, centre cross, x-range, nominal 640x1440 and the ACTUAL browser size/DPR, left/right neighbour arrows. Built-in `test` patterns only draw name+grid, no number/size/colour per surface, hence the url route.
(c) Live slot = surface `live` (full 3200x1440) plus cues: key 1 "TEST" (5 patterns, live off), 2 "LIVE di scene" (live source=project, ref empty: pick the scene project in the desk inspector), 3 "LIVE NDI" (source ndi, name empty: pick it at the venue), 4 "LIVE web page URL" (set the address), 5 BLACK. Fade 0 so a cue switches at once.

## Gaps (no code written)
1. No crop/slice: one source cannot be cut into 5 slices. Not needed for contiguous 3200 px: live content goes to the one full-width `live` surface. If the 5 screens ever become 5 separate outputs, this is missing.
2. A cue's source ref for LIVE di/NDI/URL is empty until chosen at the venue (cues store kind+ref; ref unknown tonight). After choosing, re-save the cue from the desk.
3. `data:` URL pages are not a di feature as such (works via the url source; edits to the pattern need new ops). Proper home: a page published into the space (owed).
4. Project is private: a venue PC on dev.diiii.xyz must sign in (or the owner makes it visible). PONYO follows di-laser (follow showed ops queued, "in 0 out 3" earlier today: confirm PONYO really has jam-5-screens before leaving). Not checked on dev.
5. Not verified: real 3200x1440 hardware, Windows, other machines. Browser agent screen is 2561 wide; the shot used a 3200x1440 emulated viewport.
6. Raw Picture Out / NDI-in not exercised tonight (no live source tried).

## Venue steps (untested on those machines; no lasers/cubes involved)
Check first: set the display to 3200x1440 as ONE monitor, scaling 100 % (DPR 1). The test pattern prints "actual: 640x1440 @1x" per screen: if it differs, scaling is on.
### A. aylmo (Linux, KDE)
1. System Settings > Display: pick the 3200x1440 screen, scale 100 %, note its name. `kscreen-doctor -o   # list outputs`
2. `di-show http://diiii.localhost/di-laser/map/jam-5-screens/out` puts it in the di browser; then drag that window to the 3200x1440 screen (Meta+Shift+Right moves a window to the next screen) and press F11 or the page's "Full screen" / per-display button (allow the permission).
3. Kiosk alternative: `chromium --kiosk --user-data-dir=$HOME/.cache/jam-kiosk --window-position=X,0 http://diiii.localhost/di-laser/map/jam-5-screens/out` (X = left edge of the screen from kscreen-doctor).
4. Sleep/screensaver: the /out page holds a wake lock, but also: System Settings > Power Management: turn off dim/screen off/sleep; Screen Locking: never. Or `systemd-inhibit --what=idle:sleep --why=jam sleep 6h   # in a terminal for the night`.
5. Control from the laptop screen: desk page http://diiii.localhost/di-laser/map/jam-5-screens, keys 1-5 fire cues (output window listens by BroadcastChannel only on the same browser profile; if desk and output are in different browsers use `output.show`/stage or fire cues in the same browser).
### B. PONYO (Windows)
1. Settings > System > Display: select the 3200x1440 monitor, "Extend", scale 100 %. Win+Shift+Arrow moves the window onto it.
2. Chrome/Edge: open the address of the synced copy: `http://diiii.localhost/di-laser/map/jam-5-screens/out` if di runs on PONYO and followed di-laser, else the dev address (case C). F11, or kiosk: `chrome.exe --kiosk --user-data-dir=%TEMP%\jam --window-position=X,0 <url>` (X = left edge of that display in Display settings ordering).
3. Sleep: Settings > System > Power: Screen and sleep = Never (plugged in). Screen saver off: Settings > Personalization > Lock screen > Screen saver > None. Win+L lock disabled by not leaving it.
### C. Venue PC (browser, dev or local door)
1. Browser to https://dev.diiii.xyz/di-laser/map/jam-5-screens/out after signing in (project is private) or a di door on the LAN (local.thedi.studio, not *.localhost: that only means "this machine").
2. Drag window to the 3200x1440 display, F11 (or the "Full screen"/display button). Same kiosk flag as B if Chrome.
3. Power options to Never sleep, screensaver None; on macOS: `caffeinate -d` in Terminal.
### Other software makes the picture (OBS, Resolume, TouchDesigner)
Option 1 (no di): send its output to the 3200x1440 display directly; use the test pattern first by opening the /out page, check order, then close it.
Option 2 (di as the router): `di ndi get` on the driving machine, source name in the NDI sender, press cue 3, pick the NDI name on surface `live`. Or a virtual camera / capture card as source `stream`.
### Show-time order
Cue 1 (test pattern): confirm 1-5 left to right, borders visible on all outer edges (1 px line at each screen edge; a missing line = overscan/scaling), grid squares square (80 px), "actual 640x1440 @1x". Then cue 2/3/4, cue 5 = black.

## Review (learn once)
Built: mapping + cues in a project, in di (nothing left as script except scratchpad generator, kept in session scratchpad: its ops are in the project's op log). Owed: pattern as published page (gap 3); a generic "N-screen test pattern" template as a di feature (row to add). ~30 tool calls. Sterile: agent browser lanes stopped (`di-test-browser down`), 0 tabs left on :9223, no stacks started.
