# Show hub (lava hub) — one place every show device joins

One process, `scripts/show/lava-hub.mjs`, on studio-mac (10.0.0.142), listening on 0.0.0.0:4400. Owner 2026-11-07: "everything connected to the one place in the server, all can connect and work and do things there". The file names say "lava"; the concept is the **show hub**.

```
tablet-game   /game ----ws----+
surface       /surface <-ws---+          +--> lasers  (di engine, loopback HTTP; frame once per look + alive 50 ms)
laser-desk / lights-desk /ws -+--> HUB --+--> DMX     (sACN/Art-Net unicast, 30 Hz, 4 RGB fixtures at 1,4,7,10)
operator      /control -------+          +--> surface (canvas page)
OSC tools     UDP 9000 in ----+          +--> OSC out (host:port list)
viewer        /  (home) ------+
```

## Run
- Dry run (sends nothing real): `node scripts/show/lava-hub.mjs --port 4400 --dmx sacn:10.0.0.216 --lasers on --sim`
- Real: drop `--sim`. Needs di running on studio-mac (laser engine 127.0.0.1:4000), token in `~/.di/data/laser/.token`, and node installed there.
- Options: `--dmx artnet:<ip>`, `--master 0.8`, `--osc-in 9000|off`, `--osc-out host:port,host:port`, `--claim laser,dmx` (see Claims), `--help`.

## Pages
- `/` home: every connected device (role, IP, last seen, health) and the show state.
- `/control` operator page (phone or laptop on 10.0.0.0/24): mode live/loop/kill, master slider (max 80 %), scenes (follow game, calm, rising, eruption, blackout-safe), per-output on/off and claim buttons, live state. Square corners; the di tokens are a local copy (not shared with the app CSS).
- `/game` tablet game (emitter injected at serve time; `scripts/show/lava/lava-floor.html` is the owner's file, unchanged). `/surface` projector page. `/status` health JSON + KILL/resume. `/api/state`, `/health`.

## Devices and the shared show state
`WS /ws?role=<role>&name=<name>` with role `tablet-game | surface | laser-desk | lights-desk | operator | viewer` (`game` = `tablet-game`; unknown = viewer). A client may also send `{type:'join', role, name}` and `{type:'health', health:'text'}`.
The hub keeps one state `{lava, step, scene, mode: live|loop|kill, master, outputs:{laser,dmx,surface:{on, claim, health}}}` and broadcasts `{type:'show', show, devices}` on every change (max 10/s, heartbeat 2 s). Only `tablet-game` may send game events (untyped `{event, lava, step, tile, hearts, t}`). Only `operator` may send `{type:'control', control:{...}}`; the same body works as `POST /api/control`:
`{mode, master, scene, outputs:{laser:{on}}, claim:{output:'laser'|'dmx', holder:'hub'|'none'|'<label>'}}`.
Not done: /mesh message-shape compatibility with `serverXR/src/meshHub.js` (not cheap; left out).

## Claims — one sender per output
Default claim is **NONE**: the hub sends nothing to lasers or DMX until someone takes the claim in `/control` ("hub takes") or starts with `--claim laser,dmx`. "Desk holds" records that another sender (Emily's PONYO desk) owns the output; the hub then sends nothing there. The claim view shows the holder per output.

## OSC bridge
In (default UDP 9000): `/lava/level f`, `/lava/event s`, `/show/mode s` (live|loop|kill), `/show/scene s`. Out: same addresses to every `--osc-out` target on state change. In is capped at 100 msg/s, out at 40 msg/s (`/lava/level` at most 20/s); mode changes always go out. OSC peers appear on the home page.

## Safety (scripts/show/lava/safety.mjs) stays in front of every output
Values clamped; outputs max 40 Hz; slew limit; brightness may not reverse more than 6 times a second (3 Hz); master cap 80 % (the slider cannot exceed it); game silent over 2 s: fade over 3 s to the timed loop (never dark); laser engine unreachable: laser sending stops, /health says so; kill (`POST /kill`, `/control`, OSC `/show/mode kill`) blacks out lasers (`/laser/api/blackout`) and sends DMX 0 and holds until resume. **The hub never arms lasers**; /health shows `armed`.
Network note: /control and /api/control have no login; the hub is meant for the closed show LAN (dob-0, 10.0.0.0/24) only.

## Not verified yet
Real cubes, real DMX fixtures, real tablet, real phones on /control, Eter's and Emily's software on OSC. Sequence for the show: `--sim` run, then a claim on DMX at low master, then lasers (armed by a human in di).
