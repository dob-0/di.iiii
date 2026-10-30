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
    summary: "drop every kept laser frame at once: the cubes draw nothing, output goes off, and the lasers stay disarmed until the sign-off phrase is typed again (the light desk's blackout does not reach the lasers)",
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
  }
]
