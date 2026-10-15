## 2026-10-14 — Laser Out the TouchDesigner way: one cube per Out by IP, ON/OFF on the card

Branch `feat/laser-out-ip-onoff`, from dev after #931/#932/#933. Cloud session; no real cube was armed or sent to.

- Each Laser Out has a Cube IP field, always visible and editable. Find cubes fills it ("Use for this Out": address + serial).
  The server (`POST /laser/api/resolve`) takes private unicast only, asks the address 0x77 (or uses the engine's fresh
  answer), writes the cube into laser.json keyed by serial (`laserConfig.upsertCube`) and adds it to the RUNNING engine
  (`upsertCube`, no reload: the other cube keeps drawing). The Out shows answering / wrong serial / no answer / refused.
- One sender per cube: the Out holds its cube (claim, 10 s, renewed by its frames, keep-alives and 3 s checks). Another
  Out's address, frames or ON on that cube are refused in words. Frames to 'all' no longer clear a held cube's frame.
- ON/OFF on the card: `arm({ cube, out })` switches one cube. The phrase is asked on the first ON of a run (server start,
  reload, or Disarm all); the run stays signed off until Disarm all. OFF is one click; Disarm all stays on the card.
- Fixed on the way: the engine's `sim()` read the startup config, so a cube added at run time never opened the socket.
- Validation: 6 server tests (`laserOut.test.js`), 4 panel tests, `node scripts/laser/fake-cube-two-outs.mjs` 13/13 on
  127.0.0.2/127.0.0.3 (real sockets, real timers). Full suite: 10543 passed; the 4 `scripts/di/oneAddressPrinted` failures
  fail on dev in the cloud container too. UNVERIFIED: a real browser look at the card, and real cubes (the owner, at the jam).
