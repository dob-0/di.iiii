// Catalogue entries: laser (MOXIR's LaserCubes, serverXR/src/laser). Shape and rules: ../index.js.
//
// None of these is open to the agent door. The reads are harmless, but the writes put a class-4
// beam where a frame says, and the arm route is the laser safety officer's sign-off: a person at
// the editor does these, never an agent.

const LOCAL = "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier. The engine is built on the first request and is DISARMED at every start."

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
    note: `${LOCAL} A lit frame not refreshed for 200 ms blanks the cube (the signal-loss stop).`
  },
  {
    route: "POST /laser/api/alive",
    summary: "the editor still holds this frame: refreshes its time so the signal-loss stop does not blank it",
    reach: "private",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "POST /laser/api/blackout",
    summary: "drop every kept laser frame at once: the cubes draw nothing",
    reach: "private",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "POST /laser/api/arm",
    summary: "arm the lasers with the laser safety officer's sign-off phrase, or disarm (every cube's output off)",
    reach: "private",
    role: "guest",
    agent: false,
    note: `${LOCAL} Arms only cubes that have answered their info question; 403 without the exact phrase.`
  }
]
