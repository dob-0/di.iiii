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
  dmxin.js        DMX INPUT, pure: ArtDmx/ArtPoll/ArtPollReply + E1.31 parse/build, the merge
  dmxin-net.js    DMX INPUT, the sockets: bind per interface, source filter, ArtPollReply
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
what a phone on the Touch page needs. On a `di` install that flag rides with `di up --lan`,
which is also the only start that binds anything but loopback (`docs/deploy/DI_CLI.md`).
The host hands the desk its bind (`createDesk({ listen })` → `status.listen`, read per
poll) and the Phone box reads it: the real URL and QR when a phone can get there, and
"Phones cannot reach this desk — start it with: di up --lan" when it cannot — never a
URL no phone can open. A desk that was not told (the standalone club build before its
next sync) trusts the interface list as it always did.

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
- `POST /light/api/fixtures/move {moves:[{id, x, y}]}` — a fixture's place on the plan,
  by id. The desk's own drag uses it, and so does Studio's **Send positions to the desk**
  (`src/rigMirror/sendPositions.js`) — the ONE write the app makes to the desk.
- **The join from a room to the rig is a number.** A Studio lamp carries
  `components.fixture = { index }`, the fixture's `index` on this desk (`3.Back left`);
  never universe/address, which belong to the show the desk runs (the space's or this
  machine's `show.json`, below) and never travel inside a project document. While the desk is here the lamp draws what the fixture emits
  (`src/rigMirror/liveLight.js`); otherwise its authored light. Design:
  `di-atlas/decisions/2026-09-20-one-project-one-stage.md`.
- `GET /light/api/library`, `/library/manufacturer?key=`, `/library/fixture?…` and
  `POST /light/api/library/import {manufacturer, key, mode}` — patch by name.

Data: one show loaded at a time, like a console's show file.

- **A space's show** — `<spacesDir>/<id>/lighting/show.json`, beside the space's scene.
  A page opened for a space lives at `/light/space/<id>/` (`/light/?space=<id>` redirects
  there), so its relative `api/*` calls say which show they mean; the first open loads that
  show unless output is on. It travels in the space's `.diiii` file
  (`scripts/space-bundle.mjs`) and goes when the space is deleted.
- **This machine's own show** — `<dataDir>/lighting/show.json`, where it always was; the
  standalone club desk has only this one.
- **The rig stays with the machine.** `output` (driver, port, targets, devices, on/off) is
  never written into a space's show and never changed by loading one; while a space's show
  is loaded, a change under OUTPUT is written into the machine's file.
- `GET /light/api/show` says which show is loaded and where its file is;
  `POST /light/api/show/open {space | null, live?}` loads one (refused with output on unless
  `live: true`); `POST /light/api/show/copy-machine` is the one migration — a copy — and
  `<dataDir>/lighting/desk.json` remembers the loaded show across a restart. A `space/<id>/`
  request while another show is loaded answers 409 `other-show`. Plain `/light/api/*` (cues,
  the graph's DMX Out, Studio's rig mirror, the phone) acts on whatever show is loaded.

Every show file is written whole to a temp file and renamed, with `show.prev.json` kept;
a load falls back to the temp, then the previous copy.
See `LIGHTING_SHOW_PORTABILITY.md` for what travels and what is still owed.

## Input — a console drives the desk

Added 2026-09-28 (branch `feat/dmx-input`). A lighting console — grandMA3 (desk or onPC),
Eos, MagicQ, anything that speaks Art-Net or sACN — sends its universes at this machine,
the desk's frame follows, and every lamp in a space joined to a fixture
(`components.fixture`, `src/rigMirror/liveLight.js`) draws what the console is doing. The
room is a visualiser. If output is on, the real rig follows too (see "no loops").

**Specs built to, by version** — both named in the code:

- **Art-Net 4**, Artistic Licence, *Art-Net 4 Protocol Release V1.4*, document revision
  1.4dp, 23/10/2025 (art-net.org.uk/downloads/art-net.pdf). ArtDmx (OpOutput 0x5000),
  ArtPoll (0x2000, accepted from 14 bytes, Targeted Mode honoured), ArtPollReply (0x2100,
  239 bytes, unicast to the poller after a random delay ≤ 1 s, as the spec asks). We reply
  as Style `StVisual` (0x06) with PortTypes "output from Art-Net", SwOut = our universes,
  4 ports per reply and one reply per Net:Sub-Net, BindIndex 1..n.
- **sACN — ANSI E1.31-2018** (ESTA). Every "receivers shall discard" rule of §5–§7
  (preamble, ACN PID, root/framing/DMP vectors, universe 1–63999, 0xa1, first address 0,
  increment 1, count ≤ 513); multicast 239.255.hi.lo (§9.3.1, IGMP by the OS); priority
  0–200, values over 200 clamped (§6.2.3); sequence per source per universe, a packet with
  `B − A` in (−20, 0] discarded (§6.7.2); Stream_Terminated drops the source at once and
  its data is ignored (§6.2.6); Preview_Data never drives output (§6.2.6); network data
  loss after 2.5 s (§6.7.1). Only NULL START Code (0x00) data is levels; other start codes
  (e.g. 0xDD per-slot priority) are counted and ignored. Synchronization and Universe
  Discovery packets are recognised and not acted on — §6.2.4.1/§6.5 allow a receiver
  without synchronization to process data as it comes.

### Ports — what to open on a firewall

| Protocol | Port | Direction | Notes |
| --- | --- | --- | --- |
| Art-Net | **UDP 6454** | in (ArtDmx, ArtPoll) and out (ArtPollReply, unicast) | The desk's Art-Net OUTPUT also uses 6454. |
| sACN | **UDP 5568** | in | Multicast 239.255.0.1 … (one group per universe) and unicast. The switch must pass IGMP (or flood multicast). |

`ufw` example for a show network 192.168.1.0/24: `ufw allow from 192.168.1.0/24 to any port 6454 proto udp`
and the same for 5568. Nothing else is needed; the web page stays where `di up` put it.

### Security

Off by default, and saved with the rig (`output.input` in the machine's own show file —
never in a space's show, never in a `.diiii`). Switched on, it listens only on the
interfaces ticked in Setup → Input:

- Art-Net: one socket bound to each ticked interface's own address, plus one bound to its
  directed-broadcast address (Linux/macOS deliver broadcast only there; Windows delivers it
  to the address-bound socket). Never the wildcard: the output socket already holds
  `0.0.0.0:6454`.
- sACN: multicast needs the wildcard, so one socket on `0.0.0.0:5568` joins the universe
  groups on the ticked interfaces only.
- Every packet on both is then checked: its source must lie in a ticked interface's subnet
  (`127.0.0.0/8` for loopback). Anything else is dropped and counted ("from outside the
  chosen networks"). A Tailscale peer or a routed stranger cannot drive the rig.
- Inside di.iiii without `--lan` (`DI_ALLOW_LAN_DEVICES` unset) only loopback can be ticked
  — the same rule as the Phone box and OSC.
- The desk is still dormant until the first request to `/light`: after a restart, input
  comes back as soon as anything asks the desk — the Light page, or a room with a joined
  lamp (its mirror polls `/light/api/dmx`). A machine that must listen with no browser open
  should run the standalone desk (`standalone.js`) or be asked once at boot; owed, below.

### Numbering — one rule

The desk counts universes from 1 on screen (0 internally). **Universe 1 = Art-Net 0:0:0
(Port-Address 0) = sACN universe 1.** Every input line on the page shows both numbers.
That is the convention most consoles default to; if a console is set differently, change
the console's number to what the line shows.

### Merge — declared, as E1.31 §6.2.3.4–5 requires

Per listened universe:

1. **Arbitration by priority.** Only the sources at the highest priority present decide the
   universe. sACN carries its own priority; Art-Net has none and stands at 100 (sACN's
   default).
2. **Merge at that priority**, chosen per universe: **HTP** (highest value per slot) or
   **LTP** (per slot, whichever source changed it last; a source's first packet writes all
   its slots; when the winning set changes the newest winner's whole frame is the start).
3. **How many:** Art-Net merges at most **two** sources per universe — Art-Net 4: "any
   additional sources will be ignored". sACN merges up to **eight**.
4. **Sources exceeded:** the extra source is refused, never swapped for one already
   merging (§6.2.3.3 warns against order-dependent picks). The line says so in red, naming
   the ignored source.
5. **Loss.** sACN: 2.5 s or Stream_Terminated. Art-Net: 10 s — the spec's hold for a failed
   merge source, and longer than Art-Net's allowed 4 s keep-alive, so a console holding a
   look is never dropped. When no source is left: **release** (default) hands the universe
   back to the desk; **hold** keeps the console's last look until the signal returns or
   "Release held look" is pressed.

**Input vs the desk's own playback**, per universe:

- **follow the console** (default) — while there is signal the console's frame replaces the
  desk's on that universe. With no signal the desk's own frame is what goes out: the desk is
  the fallback.
- **HTP with the desk** — the higher of the desk and the console, slot by slot.

Input is laid over the desk AFTER its fades, master and FX — the console has its own. The
desk's **Blackout still wins**: while it is on, input is not applied at all and the desk's
blacked-out frame (moving heads holding position) goes out.

### No loops

A universe the console feeds over a protocol is **never sent back out on that same
protocol** — neither the main output nor a "More devices" line. It still goes out of any
other wire (a DMX USB PRO, or the other protocol): that is the explicit route from a
console to this rig. On top of that, our own sACN is recognised by its CID and our own
Art-Net by being the bytes we sent on that Port-Address in the last second from one of our
addresses; both are dropped and counted ("our own").

### Status — never silent

Setup → Input's folded line and the `in:` pill in the top bar (every page) say one of:
"Following <console> on N of M universes", "No signal since 21:03 — the desk has the rig",
"No signal — holding the last look since …", "Listening — no signal yet", "Input cannot
listen: 192.168.1.5:6454 EADDRINUSE", or that no interface/universe is chosen. Opened, each
line shows its sources (name, address, priority, fps, last-packet age, late packets), and
below: what is bound where, packet counts (taken / out of sequence / malformed / foreign /
our own), universes arriving that nobody listens to, and the last ArtPoll heard.

API: `GET /light/api/input` (the whole status), `POST /light/api/input {enabled, artnet,
sacn, interfaces[], universes[{universe, merge, desk}], loss, name}` (answers after the
sockets have bound), `POST /light/api/input/release`. `GET /light/api/summary` carries
`input: {enabled, text, level, live}`.

### Pointing a grandMA3 at us — step by step

Menu names as in grandMA3 v2.x; check them on the console you have.

1. Put the console (or the onPC laptop) on the same network as this machine, e.g. both on
   192.168.1.x/24. Note this machine's address (Setup → Input lists the interfaces).
2. Here: `di up --lan` (a console on another machine needs LAN), open `/light`, Setup →
   **Input**: press **Input is OFF** to turn it on, tick the interface on the console's
   network, tick Art-Net and/or sACN, type the universe (e.g. `1`) and press **Listen**.
   The line shows `Art-Net 0:0:0 · sACN 1`.
3. On the console: **Menu → DMX Protocols**.
   - **sACN** (preferred): enable it on the network interface of step 1; add a line with
     Mode *Output*, Local Universe = the MA universe you patched, sACN Universe = the
     number our line shows (1), Destination *Multicast* (or Unicast to this machine's IP),
     Priority 100.
   - **Art-Net**: enable it on that interface; add a line with Mode *Output*, Local
     Universe = the MA universe, Art-Net Universe = the Port-Address our line shows
     (0:0:0 for Universe 1), Destination *Unicast* to this machine's IP (Art-Net 4 wants
     unicast; broadcast also works).
4. On the console's Art-Net node list this machine appears as **di.iiii visual** (the name
   is editable in Setup → Input), Style *Visualiser*, with the listened universes as its
   output ports.
5. Here the folded line turns cyan: **Following <console name> on 1 of 1 universe**. Patch
   fixtures on this desk at the same universe/addresses as on the console, join each room
   lamp to its fixture number, and the room follows the console.
6. If nothing arrives: the line says "Listening — no signal yet". Check the console's
   interface/IP, the universe number shown on our line, the firewall (ports above), and
   "also arriving, not listened to" — it names universes that reach us but are not ticked.

### Tested, and measured

Tests (`node serverXR/src/lighting/tests/test-dmxin.js`, also run by `lighting.test.js`):
byte layouts of ArtDmx, ArtPoll (min length, targeted mode), ArtPollReply (every field at
its offset, pages/BindIndex), E1.31 root/framing/DMP layers and each discard rule; the
§6.7.2 sequence window including wrap; priority, HTP, LTP, stream-terminated, preview,
2.5 s / 10 s loss, hold/release, Art-Net's two-source limit; the desk overlay (follow, HTP,
blackout wins, input-only universe appears); then real UDP on loopback on private ports
(ArtDmx, E1.31 unicast, our own CID refused, ArtPoll answered, foreign source dropped).

End to end on aylmo (2026-09-28, serverXR on :4371, Linux, wlp0s20f3 192.168.88.231),
with `tests/dmx-send.js` as the console:

- Received and applied: sACN unicast on loopback; sACN multicast on the LAN
  (239.255.0.x joined on the LAN interface); Art-Net unicast on the LAN, loopback, and
  directed broadcast 192.168.88.255. ArtPoll answered with a 239-byte ArtPollReply.
- A lamp joined to fixture 1 (drgb, Universe 1 @1), computed by the room's own code
  (`mirrorFixtures` + `liveLightEntity`) from the running desk: desk alone `#ffffff` at 2;
  console sACN red → `#ff0000` at 2; plus an Art-Net source with blue → HTP `#ff00ff`;
  sACN stream-terminated → Art-Net only `#0000ff` at 1.004.
- No echo: with output ON (unicast to 127.0.0.3, nothing left the machine) and input on
  Universes 1–3, our Art-Net output carried only Universe 4 (40 packets/s) — none of the
  input universes.
- **Latency, packet in → desk state** (`tests/bench-input.js`, 200 trials each): in-process
  (UDP loopback → parse → merge → frame) p50 0.04 ms / p95 0.14 ms (sACN), 0.03 / 0.06 ms
  (Art-Net). Through HTTP (send, then GET `api/dmx` until the value shows): p50 1.47 ms /
  p95 1.65 ms (sACN), 1.52 / 1.69 ms (Art-Net) — the same as one GET on its own (p50
  1.55 ms, p95 1.89 ms): the value is always there by the first answer. On the wire out it
  then waits for the next output tick (≤ 25 ms at 40 Hz). A room lamp polls `api/dmx` every
  100 ms (`DMX_POLL_MS`), which is the visualiser's own latency.
- **Sustained, 44 Hz × 3 universes, 60 s each**: sACN multicast over the LAN — 7923 sent,
  7923 accepted, 0 lost, 0 out of sequence, desk reports 44 fps on each universe, sampled
  state 0 frames behind the sender (118 samples), desk process 1.2 % of one core. Art-Net
  unicast — 7920 / 7920, 0 lost, 0 out of sequence, 0 frames behind, 2.0 % of one core
  (44 fps per universe read from the status in a separate run).

Limits of those numbers: one machine, sender and receiver on the same host (loopback and
the LAN address of the same card — no real switch, no wifi between); a simulated console,
not a real one.

### Not done — owed

- **A real console.** Not tested against grandMA3, Eos or onPC hardware/software. grandMA3
  onPC is a free download and outputs Art-Net/sACN — the owner can run steps 1–6 above on a
  second laptop; that is the test that closes this.
- **Output sACN universe 0.** The desk's own sACN OUTPUT (`sacn.js`, unchanged here) sends
  desk Universe 1 as sACN universe 0, which E1.31 §6.2.7 reserves — receivers discard it.
  Input uses Universe 1 = sACN 1. Output should send `u + 1`; a one-line fix, not made here
  because it changes what existing sACN nodes receive.
- **Boot without a browser**: inside di.iiii the desk (and so input) starts on first request.
- Universe synchronization (E1.31 §11 / ArtSync) is not implemented; data is applied as
  it arrives, which the specs permit.
- Preview data is always ignored; a visualiser-only "accept preview" switch could come.
- ArtAddress (remote merge-mode / name programming), ArtPollReply on change (Flags bit 1),
  E1.31 Universe Discovery, per-slot priority (0xDD), IPv6: not implemented.
