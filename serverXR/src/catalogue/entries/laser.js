// Catalogue entries: laser (MOXIR's LaserCubes, serverXR/src/laser). Shape and rules: ../index.js.
//
// None of these is open to the agent door. The reads are harmless, but the writes put a class-4
// beam where a frame says, and the arm route is the laser safety officer's sign-off: a person at
// the editor does these, never an agent.

const LOCAL = "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier. The engine is built on the first request and is DISARMED at every start."
// 2026-10-14: the routes that make a cube emit or change which cubes are driven answer only a browser
// on the same machine with no proxy in between (localRuntimeGuard.js requireSameMachine).
const SAME_MACHINE = "behind requireSameMachine: a loopback peer with no forwarding header (Forwarded, any X-Forwarded-*, X-Real-IP, Via, CF-Connecting-IP, …) and no TRUST_PROXY in the environment, or any caller when DI_ALLOW_LAN_DEVICES=1; 404 on a hosted tier."
// Review round 2 (2026-10-14): every laser POST also passes requireOwnPage first (CSRF and DNS rebinding).
const OWN_PAGE = "Every laser POST first passes requireOwnPage: Host is one of this machine's own names (localhost, 127.0.0.1, [::1], diiii.localhost, *.diiii.localhost, DI_LOCAL_NAME) and Origin, or Referer, is that same origin; no Origin and no Referer only from loopback. Named 403 otherwise."

module.exports = [
  {
    route: "GET /laser/api/state",
    summary: "the lasers: armed or not, sim or real, the keep-in zone, the guards' limits, and each cube's info (firmware, DAC rates, buffer, temperature, serial, model), rate and stop",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "GET /laser/api/frames",
    summary: "the frames the laser server keeps (all cubes and per cube, the zone applied) and which cubes are stopped — what the room's laser view draws",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "POST /laser/api/frame",
    summary: "keep a laser frame for all cubes or one: [[x, y, r, g, b], …], the keep-in zone applied; streamed only while armed",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} A lit frame not refreshed for 200 ms blanks the cube (the signal-loss stop).`
  },
  {
    route: "POST /laser/api/alive",
    summary: "the editor still holds this frame: refreshes its time so the signal-loss stop does not blank it",
    reach: "private",
    role: "guest",
    agent: false,
    note: SAME_MACHINE
  },
  {
    route: "POST /laser/api/blackout",
    summary: "drop every kept laser frame at once: the cubes draw nothing",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} A stop, like disarm: both follow STOPS_FROM_REMOTE in laserRoutes.js (false until the owner decides, ledger N644.2).`
  },
  {
    route: "POST /laser/api/arm",
    summary: "arm the lasers with the laser safety officer's sign-off phrase, or disarm (every cube's output off); with { cube, out } one cube ON or OFF, the phrase only on the first ON of a run",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} Arms only cubes that have answered their info question; 403 without the exact phrase, which is never echoed.`
  },
  {
    route: "POST /laser/api/find",
    summary: "find the LaserCubes on this computer's networks: the read-only info question (0x77) to every address of each local IPv4 /24, and the cubes that answered (model, serial, address, firmware, temperature)",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} One search at a time and 5 s between searches (429 with retryAfterMs). Sends nothing but 0x77.`
  },
  {
    route: "POST /laser/api/resolve",
    summary: "a Laser Out's own cube by address: { ip, serial?, name?, out } checked private unicast, asked the info question (0x77) unless the engine already hears it, added to laser.json and the running engine keyed by serial (no reload), and held for that Out (one Out per cube); status answering | wrong-serial | no-answer | refused",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} Sends nothing but 0x77. A cube held by another Out, or ON at another address, is refused (409).`
  },
  {
    route: "POST /laser/api/config",
    summary: "use these cubes: write laser.json from the picked { serial, ip, name } (ids kept by serial, zone kept, still beams carried only on a serial match, the old file kept as laser.json.prev) and reload the engine, disarmed",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} The engine is disarmed and closed before the new file is read; no restart.`
  },
  {
    route: "POST /laser/api/show",
    summary: "play a project's laser lines on the cubes: { project, map?: { cubeId: groupId }, scale?, reloadMs? } — each cube takes the frames of its rig line group (rig-laser-<n>*), re-aimed from the line's rotation into the cube's field; `scale` 0.1…10 zooms about the cube's axis, 'fit' fills the cube's keep-in zone with each picture; the document is re-read every reloadMs",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} Frames only: nothing lights until the laser safety officer has armed; a cube held by another Out is refused. 404 for an unknown project, 501 when this server has no document loader.`
  },
  {
    route: "POST /laser/api/show/stop",
    summary: "stop the show: every playing cube gets one blank frame; the engine's arming is untouched",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} From the LAN too when DI_LASER_REMOTE_STOP is on (the same gate as /blackout).`
  },
  {
    route: "POST /laser/api/show/still",
    summary: "the still beams a show needs, per cube, as the engine would judge them (after its keep-in zone, at the show's scale): { project, map?, scale?, confirm? } — without the officer's phrase it answers { needsPhrase, wouldApprove }; with it the dots are written into laser.json's stillBeams and the engine reloads disarmed",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} The phrase is never echoed. Dots already approved are not doubled (0.005 grid).`
  },
  // The laser desk (laser/laserDesk.js, 2026-10-29): the light desk's twin for the cubes, one more sender (Out "desk").
  // Its frames meet every rule of the engine; nothing here arms a cube or loosens a guard.
  {
    route: "GET /laser",
    summary: "the laser desk's page (laser/ui/): a bank of looks, the live look's editor, the stage (what each cube holds) and the cubes' setup; /laser redirects to /laser/",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "GET /laser/desk/api/state",
    summary: "the laser desk: the bank of looks, the live look, master, BPM and beat, blackout, and each cube's desk setup (on, mirror, size, offset, order) and whether another Out holds it",
    reach: "read",
    role: "guest",
    agent: false,
    note: `${LOCAL} The desk is built on its first request and starts released: nothing on the cubes until a look is pressed.`
  },
  {
    route: "GET /laser/desk/api/view",
    summary: "what the laser engine keeps for each cube now, after its keep-in zone, rounded — the desk's stage view",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "GET /laser/desk/api/thumbs",
    summary: "a small picture of every look in the desk's bank, for its tiles",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "GET /laser/lib/laser.js",
    summary: "the desk's drawing code for its page (shared/laserFrame, laserShapes, laserLook as one script): the bank's tiles play every look as the cubes would",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "POST /laser/desk/api/go",
    summary: "put a look of the bank on the cubes: { look } — the desk draws it every 50 ms as the Out \"desk\" (a cube another Out holds refuses it)",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} Frames only: nothing lights until the laser safety officer has armed.`
  },
  {
    route: "POST /laser/desk/api/live",
    summary: "edit the live look on the cubes: any of { name, shape, colour, rainbow, level, size, height, x, rotation, spin, copies, points, cycle, pulse, pulseBeats, sweep, sweepBeats, mirror, phase, cubes }, each clamped",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/store",
    summary: "keep a look: { id } writes it into that tile, no id adds a new tile ({ name? }); { look } stores the page's Preview instead of the live look; the bank is in <data>/laser/desk.json",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/looks/rename",
    summary: "rename a tile of the laser desk's bank: { id, name }",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/looks/edit",
    summary: "change a look of the laser desk's bank: { id, …fields } — kept in the bank until Save writes it; when that look is on the cubes they show the change at once",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE} Frames only: nothing lights until the laser safety officer has armed.`
  },
  {
    route: "POST /laser/desk/api/looks/copy",
    summary: "a copy of a look of the bank as a new tile right after it: { id } → { id } of the copy",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/looks/paste",
    summary: "a copied look as a new tile: { look, after? } — after that look of the bank, else at the end; a taken name gets the next number → { id }",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/undo",
    summary: "undo the last change to the laser desk's bank (an edit, a copy, a paste, a delete, a rename, the order, a Save's new scenes); the look on the cubes follows",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/redo",
    summary: "redo what the laser desk's undo took back",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/save",
    summary: "Save: each look whose picture changed since the last Save becomes a new scene at the end of the bank and the look goes back as it was saved (a new name alone renames in place); then the bank, clock and setup go into <data>/laser/desk.json → { created: [{ from, id }] }",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/looks/delete",
    summary: "remove a tile from the laser desk's bank: { id } (the live look stays on the cubes)",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/looks/order",
    summary: "the laser desk's bank in a new order: { ids }",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/master",
    summary: "the laser desk's master level: { level } 0…1, multiplying every look's level",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/bpm",
    summary: "the laser desk's clock: { bpm } 20…300 (the beat keeps its place), or { tap: true } (the tempo from the taps, the beat on the tap)",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/cube",
    summary: "one cube's place on the laser desk: { id, on?, flipX?, size? 0…2, x? y? −1…1, order? } — off lets the desk's hold on it run out",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} ${OWN_PAGE}`
  },
  {
    route: "POST /laser/desk/api/release",
    summary: "the laser desk lets go: every cube it drew on gets one blank frame and the desk stops sending, so a Laser Out or the show can take them",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} A stop: the same gate as /laser/api/blackout (STOPS_FROM_REMOTE).`
  },
  {
    route: "POST /laser/desk/api/blackout",
    summary: "the laser desk's blackout: { on } — every cube it drives held dark, the look kept",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${SAME_MACHINE} A stop: the same gate as /laser/api/blackout (STOPS_FROM_REMOTE).`
  }
]
