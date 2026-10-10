## 2026-10-09 — the LaserCube drive finished on top of #776: cube info, the signal-loss stop, the still-beam guard

On top of Emilya's #776 (`feat/moxir-laser-raw-2026-10-05`, her fork; merged with origin/dev 85d5ae49 here, her branch untouched). The owner's decision 10-09: MOXIR's six LaserCube Ultra MK2 (techno night, 17 Oct 2026) are driven from the Nodes editor.

Sources: the nannou-org/lasercube `SPECIFICATION.md` (MIT, read 2026-10-09) — **reverse-engineered from Wicked Lasers' Python sample, not the maker's document**; the physics and safety numbers in `~/work/agent-reports-2026-10-09/devices/lasers-exact.md` (the report). No real laser was fired; every wire test used a UDP socket standing in for a cube.

### What changed

- **Cube info** (`lasercubeProtocol.js` `parseFullInfo`): the 64-byte GET_FULL_INFO (0x77) answer at the spec's offsets — firmware, output enabled, current/max DAC rate, RX buffer free/size, battery, temperature, connection type, serial, IP, model number and name. Two open readings kept as the spec writes them: the temperature has no unit (°C assumed), and the connection type is at offset 25 in the table but "offset 26" in the prose (25 read).
- **The engine asks every addressed cube for its info at first use and every second** — the one message sent while disarmed (a read, no emission). `/laser/api/state` shows it per cube with its age; Laser Out lists every cube (what it is doing, then what it said about itself; a cube under 10 °C is marked). **A cube whose info never arrived is not armed**; none answered → nothing armed. The stream is paced to the cube's own current DAC rate with its maximum as the ceiling (`laser.json` `dacRate` may cap lower); the assumed 30000 is gone. Buffer room is estimated as the spec advises (last report + played since − sent since).
- **Signal-loss stop** (the spec's "safety timeouts"): while armed, a lit frame not refreshed for **200 ms** blanks its cube (one blank message) and sends output-off twice; a fresh frame switches it back on. Laser Out refreshes a held frame every 50 ms (`POST /laser/api/alive`, no points). A cube not heard for **3 s** is stopped and stays stopped until armed again.
- **Still-beam guard** (a software stand-in for scan-fail protection, which the maker documents none of): a frame whose every lit stretch is a dot inside **0.6°**, or one 0.6° spot taking **≥ 50 %** of the frame's time, held **200 ms**, blanks the cube. Still beams the laser safety officer lists for a cube in `laser.json` (`stillBeams: [{ x, y, within }]`) are allowed — MOXIR's design IS two static beams per cube, so the LSO lists them. Runs in sim too, so a rehearsal without cubes shows the stops. **All thresholds UNVALIDATED.**
- **Server going down**: SIGTERM/SIGINT now blank and switch off every cube (output-off ×2, buffer answers off) and wait for those to leave (≤ 250 ms) before the process ends by the same signal. #776's `exit` hook never reached a cube (known-fixes row; `laserShutdownContracts.test.js`).
- **A new frame starts where the playing one ends** (no torn figures; blackout and stops still cut at once).
- **CI**: #776's build-and-test failed on two TESTS, not lint (lint had 0 errors): the catalogue (five `/laser` routes undescribed; now `catalogue/entries/laser.js`, all `agent: false`) and the spine (`raw.css` `#000` → `var(--di-black)`).
- Kept: DISARMED at every start, the exact sign-off phrase, the keep-in zone, blackout, six sim cubes without `laser.json`.

### The thresholds and why (the full reasoning is in `laserEngine.js` GUARD)

| Number | Value | Against |
|---|---|---|
| Frame timeout | 200 ms | the 0.25 s time base of the visible MPE (IEC 60825-1 Table A.1; report §2.1): 200 ms + one 20 ms tick + the hop < 250 ms. Not a claim that 0.25 s in the beam is safe — at 61 m a static 6 W beam is 71× the MPE (report §2.3) |
| Still window | 0.6° (±0.3°) | the report treats a beam held to ±0.3° as STATIC for its maths (§2.3); a dot wandering 0.6° still gives an eye at 20 m ≥ 15 % of the static dose (4 mm + 1 mrad·r beam, 7 mm pupil, §2.4) |
| Field → degrees | ±18.5° | the maker's ">37°" (report §1, ASSUMPTION); the smaller angle makes the window wider in field units = the safe side. The scene's laser view assumes ±30° — one measured number should replace both |
| Dwell share | 50 % | half a 6 W cube's power on one spot without a break. Measured on the Laser node's 8 shapes (120 and 500 points): worst 5.9 % at size 0.5, 21.0 % at 0.1, 39.7 % at 0.05; the test keeps that headroom |
| Still hold | 200 ms | the same 0.25 s base; lets a shape pass through a point (a size knob swept through 0) |
| Link lost | 3 s | three missed info answers with no data answers either |

### Measured (2026-10-09, aylmo, scratch stack `di-dev up laser-drive --api scratch`, the fake cube on 127.0.0.1:45457/45458)

Fake cube: `fake-cube.mjs` (answers 0x77 with a spec-layout info, plays a 6000-point buffer at 30 kpps, answers each data message with its free count, logs output on/off and lit points per 100 ms). Driver: `rehearse.mjs` (both in the session scratchpad, not in the repo). `laser.json`: cube-1 = the fake cube, cube-2 = 127.0.0.2 (nobody home). 10 runs:

- arm without the phrase refused; with it: cube-1 armed, cube-2 refused (no info) — 10/10
- lit points reaching the cube while streaming: 26 000–30 000 /s (100 ms bins; the fake cube plays 30 000)
- signal loss: output-off heard twice, **173–215 ms** after the keep-alive stopped (the last keep-alive 0–50 ms before that); **0** lit points after the stop — 10/10
- resume on the next keep-alive: output-on heard 60–79 ms after keep-alives restarted
- still beam (a 60-point dot): output-off heard twice **213–238 ms** after the dot frame was posted — 10/10
- `/laser/api/state` showed the fake cube's info field by field (firmware 1.7, 30 000 of 35 000, buffer 6000, 27, Ethernet, 127.0.0.1, serial face00000001, model 3 "FAKE cube (test)")

Not measured here: a real cube's behaviour (everything below).

### The 3D scene (item 6): does it play the same point stream the cubes get?

`LaserView.jsx` / `laserView.js` read `GET /laser/api/frames` every 80 ms and draw `byCube[cubeId] || all` — the same choice the engine makes, after the keep-in zone. So **the same frames, yes; the same stream, not yet**. What is missing (not changed here: the beam's look is feat/sim-physics-kit-2026-10-09's):

1. **Stops and arming are not shown**: a disarmed, stopped (no frame, still beam, link lost) or refused cube is drawn lit. `/laser/api/frames` now carries `stopped: { cubeId: reason }` and `armed`; LaserView should draw a stopped cube dark (and say "disarmed" for the preview).
2. **Cube identity**: the scene numbers LaserCubes by entity-id order (cube-1…n); the server's ids come from `laser.json`. Any other id (e.g. "cut-1") never matches, and nothing ties an entity to an IP. Needs one mapping (an entity field naming its cube id, or `laser.json` ids = entity ids).
3. **Sampling**: the scene's view samples at 12.5/s, frames change at ≤ 25/s; the server swaps frames at the end of the playing one (≤ 67 ms for 2000 points at 30 kpps). Frames between polls are never drawn.
4. **Field angle**: ±30° in the scene's view vs ±18.5° in the guard, both assumed; measure once, use in both.
5. **Time**: the scene draws every lit point as a full beam; a cube splits its time across the frame (the report's Talbot–Plateau point). That is the look — the other agent's.

### Not tested — the real cube test, OWED (with the LSO, before 10-16)

Set-up: one cube, lowest power that shows the beam, beam block fitted, aimed into a matte black stop, nobody downrange, laser safety eyewear for 455/525/638 nm, key and interlock in reach, LaserOS closed, the cube on the show's wired switch. Record each answer in this file.

- [ ] Label photo of every cube (model, wattage, serial); the serial matches `info.serial`
- [ ] Every info field against LaserOS's own display: firmware, DAC rate and maximum, buffer size, temperature (unit, beside a thermometer), connection type (offset 25 or 26?), IP, model number and name
- [ ] Disarmed: a capture on the laser network (`tcpdump -i <nic> udp port 45457 or udp port 45458`) shows only 0x77 to 45457; the emission LED stays off
- [ ] Armed with a circle at Level 0.05: the stream holds without flicker; `rate` in the state = the cube's DAC rate; the buffer neither runs dry nor overflows (watch `rxBufferFree`)
- [ ] Close the editor tab: time to dark ≤ 250 ms (phone slow motion at 240 fps, or a photodiode)
- [ ] Hide the editor tab (another tab in front): what happens (the keep-alive slows to 1/s → the cube should go dark); decide whether that is acceptable for the show
- [ ] Output-off (0x80 0): does it cut at once, or only after the buffer drains? (measure as above)
- [ ] **Pull the cable while a figure plays**: what does the cube do when its stream stops — blank, keep looping its buffer, or HOLD THE LAST POINT LIT (a still beam no software can stop)? The LSO must know before the show
- [ ] `kill -9` the server while a figure plays: same question
- [ ] `systemctl --user stop` / SIGTERM the server: dark ≤ 250 ms
- [ ] Still beam: Laser Size 0 → dark after ~200 ms; Size 0.05 circle and the default fan do not stop; the design's two still beams listed in `stillBeams` play; a third point stops
- [ ] Full field: draw x = ±1, y = 0…1 on a wall at a measured distance → the real scan angle; replace ±18.5° (guard) and ±30° (scene view)
- [ ] Unplug one cube for 3 s: it is stopped "link lost"; plug back: it stays dark until armed again
- [ ] Reboot a cube while armed: what it does when it comes back
- [ ] Cold: the info temperature at power-on in the hall vs a thermometer; the maker's 10 °C floor
- [ ] Nothing else drives the cubes: DMX, ILDA (the maker: an external DAC takes over), LaserOS, SD playlists — off
- [ ] Six cubes at once on the show switch: each at its own rate, no lost frames (6 × ~30 000 points × 10 bytes ≈ 1.8 MB/s plus headers)
- [ ] The thresholds after the test: keep, or change by a reviewed PR (not by laser.json) and say why here; then set `GUARD.VALIDATED`

### Files

`serverXR/src/laser/lasercubeProtocol.js`, `laserEngine.js`, `laser.test.js` · `serverXR/src/routes/laserRoutes.js` (+ `POST /laser/api/alive`), `laserRoutes.test.js` · `serverXR/src/index.js` (SIGTERM/SIGINT) · `serverXR/src/laserShutdownContracts.test.js` (in `test:server-contracts`) · `serverXR/src/catalogue/entries/laser.js` · `src/raw/components/LaserOutPanelWindow.jsx` (+ test) · `src/raw/styles/raw.css` · `src/wiki/wikiContent.js` · `docs/ai/known-fixes.md`.
