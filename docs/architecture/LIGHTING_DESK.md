# The lighting desk — `/light`

di.iiii's own DMX lighting desk. It lives in `serverXR/src/lighting/` and is served by
a **local** di.iiii at `/light/` — a `di up` install or `npm run dev`. A hosted
di.iiii answers 404 there: lighting hardware sits on a machine in the room, the
same rule as OSC (`serverXR/src/localRuntimeGuard.js`).

## What it is

A zero-dependency Node.js desk, laid out like Daslight: **Setup** to patch fixtures
(a library of channel-order profiles, drag onto a 512-channel grid or a stage view),
**Control** to drive them (scenes, chase, master, blackout, an attribute editor with
colour/position/beam faders, FX and LFO engines, audio-reactive), **Touch** for a phone,
**Fader** for 512 manual channels, **MIDI** to map a hardware controller. Output goes
over Art-Net (UDP, broadcast or unicast, node discovery) or to an ENTTEC DMX USB PRO on
a serial port (Windows, Linux, macOS). One show file holds the patch, scenes, groups,
layout, output settings and MIDI mappings.

It arrived as the club's standalone desk (`~/artnet-desk`, three Telegram zips,
2026-09-02) and moved in **clean** — no fixtures, no scenes; a rig is patched here
when wanted. The club machine keeps running the same code standalone
(`serverXR/src/lighting/standalone.js`, its data folder, its own tools).

## Shape

```
serverXR/src/lighting/
  desk.js         createDesk({dataDir, offline, outputEnabledDefault, lanAllowed})
                  → { handle(req, res, path), close(), state, engine, summary() }
  standalone.js   the same desk on a port of its own (PORT, DATA_DIR, ARTNET_OFFLINE)
  engine.js       profiles, fixtures, rendering, limits, fades, chase, scene recall
  fx.js / lfo.js  effects as pure maths over (fixture, time, bpm, depth); LFO motion
  artnet.js       ArtDmx / ArtPoll packets, discovery
  enttec.js       the serial widget (mode on Windows, stty on the open fd elsewhere)
  ui/             the interface — plain files, RELATIVE addresses (api/…, style.css)
  tests/          the desk's own suites, plain node; wrapped by lighting.test.js
serverXR/src/routes/lightingRoutes.js   the mount, the guard, the redirect /light → /light/
```

`registerLightingRoutes(app)` is called in `serverXR/src/index.js` **before** the JSON
body parser, at `/light` and `${mountPath}/light`. The desk reads its own bodies (a
library push is up to 16 MB, byte-exact). Vite proxies `/light` to the backend in dev.
`light` is a reserved word in both space routers.

## The two rules that keep a dev box off a real rig

1. **Dormant until asked.** The desk is built on the first request to `/light`. A
   serverXR nobody points at lighting never loads the engine, never binds UDP 6454,
   never runs a 40 Hz loop.
2. **Output OFF by default inside di.iiii.** The engine renders (the stage view is
   live, scenes recall, the graph's node reads a true summary) but nothing leaves the
   machine until the switch under **Control → Output** is on. The standalone desk has
   the opposite default: a show machine must come back transmitting after a restart.
   The setting is saved with the show.

LAN reach follows the OSC lane: loopback only unless `DI_ALLOW_LAN_DEVICES=1`, which is
what a phone on the Touch page needs. The desk's phone panel says so when it is off.

## Looks and layers

The content model, added 2026-09-03 after the field audit
(`LIGHTING_DESK_DESIGN.md`). `looks.js` is the file; its header is the argument.

A **look** is a list of steps — one step is a scene or a palette, two that snap are a
chase, two that ease and are spread by phase are a wave crossing the rig, and a value
may point at another look, which is what a palette is. A **layer** is that look under a
finger: level, merge, priority, mask, rate. The renderer composites the stack over the
fixtures' own values, so an effect can sit on top of a running look. An empty stack
renders exactly as though the file were absent.

`fan.js` lays related values across an ordered selection in one gesture, seven styles
from the Eos vocabulary; the output is static values, recordable like anything else.
`library.js` imports fixtures from the Open Fixture Library by name, cached beside the
show, and brings each channel's resting value with it — which is what stops an imported
head coming up dark with a shut shutter. `sacn.js` is E1.31 output: multicast groups and
a priority number, beside the existing Art-Net and ENTTEC drivers.

## Talking to it

- `GET /light/api/summary` — a few hundred bytes: master, blackout, active scene, fx,
  chase, counts, output state. Poll this, not `/light/api/state` (the whole library,
  gzipped when accepted).
- `GET /light/api/scenes/summary` — `{scenes:[{id,name,fadeMs,live,missing}]}`.
- `POST /light/api/scenes/recall {id, fadeMs?}`, `POST /light/api/master {master 0..255,
  blackout}`, `POST /light/api/raw {universe, channel, value}`, `POST /light/api/fx`,
  `POST /light/api/lfos`, `POST /light/api/scenes/replace` — the full surface is the
  routes table in `desk.js`.
- The Raw graph's **DMX Out** node drives the desk (rig `desk`) or a vizzz box on the
  LAN (rig `vizzz`). A map **cue** can carry a desk scene and fires it when played.
- `GET/POST /light/api/midi` — controller mappings, saved with the show.
- `GET/POST /light/api/looks` and `/light/api/layers` — the content library and the
  stack. `POST /light/api/looks/capture` records the stage through a kind's mask;
  `/light/api/looks/add|remove` and `/light/api/layers/add|remove` are the one-object
  verbs an interface wants; `POST /light/api/layer` is the fader move.
- `POST /light/api/fan {fixtures, role, from, to, style}` — one gesture, N values.
- `GET /light/api/library`, `/library/manufacturer?key=`, `/library/fixture?…` and
  `POST /light/api/library/import {manufacturer, key, mode}` — patch by name.

Data: `<dataDir>/lighting/show.json`, written whole to a temp file and renamed, with
`show.prev.json` kept; boot falls back to the temp, then the previous copy.
