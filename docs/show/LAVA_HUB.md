# Lava hub — the tablet game drives lasers, DMX and projection

One process, `scripts/show/lava-hub.mjs`, on studio-mac (10.0.0.142). Spec: owner 2026-11-07 (Cinema House, hosq x ReA).

```
tablet  http://10.0.0.142:4400/game  --ws-->  HUB  --> lasers  (di engine, loopback HTTP, frame once per look + alive 50 ms)
                                                  --> DMX      (sACN/Art-Net unicast, 30 Hz, 4 RGB fixtures at 1,4,7,10)
projector http://10.0.0.142:4400/surface <--ws--  --> /surface (canvas, listens to the hub)
```

## Run
- Dry run (sends nothing real): `node scripts/show/lava-hub.mjs --port 4400 --dmx sacn:10.0.0.216 --lasers on --sim`
- Real: drop `--sim`. Needs di running on studio-mac (laser engine on 127.0.0.1:4000) and the token in `~/.di/data/laser/.token`.
- Art-Net instead: `--dmx artnet:10.0.0.216`. `--master 0.8` is the cap. `--help` lists all.
- Tablet: open `/game`. The hub injects the emitter at serve time; the owner's game file `scripts/show/lava/lava-floor.html` is unchanged. `?hub=ws://host:port/ws?role=game` overrides the target.
- Status page `/status` (live JSON, KILL and resume buttons); `/health` JSON; log `~/.di/logs/lava-hub.log`.

## Safety (scripts/show/lava/safety.mjs)
Values clamped; outputs max 40 Hz; slew limit per frame; brightness may not reverse more than 6 times a second (3 Hz); master cap 80 %; game silent over 2 s: everything fades over 3 s to a timed lava loop (never dark); laser engine unreachable: laser sending stops and /health says so (it resumes when the engine answers); `POST /kill` blacks out lasers (`/laser/api/blackout`) and sends DMX 0, and holds until `POST /resume`.
**The hub never arms lasers.** Arming stays a human step in di; /health shows `armed`.

## Events (game -> hub)
`{event, lava, step, tile:[c,r], hearts, t}`; events start, step, burn, ignite, win, dead, restart, beat (every 250 ms). `lava` is the front progress (0..1). Throttled to 30/s except start/win/dead/restart.

## Not verified yet (see the build report)
Real cubes, real DMX fixtures, real tablet. Do a `--sim` run, then DMX to PONYO with low `--master`, then lasers (armed by a human) before the show.
