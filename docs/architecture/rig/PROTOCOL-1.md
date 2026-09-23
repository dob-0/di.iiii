# Rig protocol 1: the build contract for step 1

Implements [RIG.md](../RIG.md) §3 and build step 1: **members know each other,
in any version.** This file is the contract every lane builds against. If code
and this file disagree, the code is wrong or this file gets a dated amendment.
Nobody silently diverges.

## 0. The rule this protocol exists to keep

From the release that ships protocol 1, **every release works with every other
release**. There is no adapter for 0.4.x (owner, 2026-09-16). So:

- The names and meanings in §2 are **frozen forever**. You may ADD optional
  fields. You may never rename, remove, retype, or change the meaning of one.
- Everything beyond the core is a **feature** with its own integer version,
  agreed per pair by taking the minimum on both sides (§3).
- Every reader is **tolerant**: unknown fields, unknown features, and unknown
  message kinds are ignored and counted, never an error (§4).

## 1. Where it lives

| | |
|---|---|
| server code | `serverXR/src/rig/` (CommonJS, like the rest of serverXR) |
| HTTP base | `/api/rig/*` on the member's own server, so `/serverXR/api/rig/*` through the normal mount |
| UDP discovery | port `47600` (env `DI_RIG_UDP_PORT`), IPv4 broadcast |
| identity file | `<DATA_ROOT>/rig/machine.json` → `{ "id": "<uuid v4>", "name": "<hostname>" }`, created once and never rewritten except `name` |
| env | `DI_RIG=0` turns the whole rig off · `DI_MACHINE_NAME` · `DI_PART=studio\|stage\|hands` · `DI_RIG_ROOM` (room name; members only pair within the same room, default `null` = the open room) · `DI_RIG_KEY` (optional shared secret, §5) |

**Who can reach it.** Every `/api/rig/*` route sits behind
`requireLocalRuntime` from `serverXR/src/localRuntimeGuard.js`: a hosted
diiii.xyz answers 404; a local install answers loopback always, and the LAN
only when `DI_ALLOW_LAN_DEVICES=1` (which `di up --lan` sets). Discovery (UDP)
runs in full **only** when the LAN is allowed; see the 2026-09-24 amendment for
the listen-only private mode.

## 2. The frozen core

All bodies are JSON. Every message carries `"rig": 1`, the protocol generation.
A future generation 2 would be a new parallel shape, and generation 1 is still
answered forever.

### 2.1 `hello`: `POST /api/rig/hello`

Request and response are both a Hello. The response adds `agreed`.

```json
{
  "rig": 1,
  "kind": "hello",
  "release": "0.5.0",
  "machine": { "id": "5b0c…", "name": "asuz" },
  "part": "stage",
  "room": null,
  "http": { "port": 4000, "base": "/serverXR" },
  "features": { "card": 1, "cue": 1, "blackout": 1, "members": 1, "discovery": 1 },
  "sentAt": 1789560000000
}
```

Response: `{ ...ownHello, "agreed": { "card": 1, … } }`. When the sender's room
differs from ours, answer `409 { "rig": 1, "error": "other-room" }`. The
receiver records the sender as a member, which is what makes links two-way:
**whoever says hello first, both sides now know each other**.

Required to accept a Hello: `rig === 1`, `machine.id` a non-empty string ≤ 128
chars. Everything else has a default: `release` "unknown", `part` "studio",
`room` null, `http.port` from the socket, `http.base` "/serverXR", `features`
{}, `name` = id.

### 2.2 `card`: `GET /api/rig/card`

```json
{
  "rig": 1,
  "kind": "card",
  "release": "0.5.0",
  "machine": { "id": "…", "name": "asuz" },
  "part": "stage",
  "partReason": "2 cores, 3.7 GB, a screen connected",
  "mode": "jam",
  "caller": null,
  "blackout": false,
  "ports": {
    "screens":  [{ "name": "HDMI-A-1", "connected": true, "width": 1920, "height": 1080 }],
    "audioOut": [{ "name": "HDA Intel PCH, ALC269VB Analog" }],
    "audioIn":  [{ "name": "HDA Intel PCH, ALC269VB Analog" }],
    "cameras":  [{ "name": "USB2.0 HD UVC WebCam", "path": "/dev/video0" }],
    "serial":   [{ "path": "/dev/ttyUSB0" }],
    "midi":     [{ "name": "…" }],
    "net":      [{ "iface": "wlp2s0f0", "kind": "wifi", "up": true, "addresses": ["192.168.88.179"] }]
  },
  "health": {
    "tempC": 77, "cpuPct": 1, "memUsedMb": 800, "memTotalMb": 3807,
    "throttled": null, "uptimeS": 1234
  },
  "shows": [{ "output": null, "url": null }],
  "features": { "card": 1, "cue": 1, "blackout": 1, "members": 1, "discovery": 1 },
  "sentAt": 1789560000000
}
```

Any field a platform cannot read is `null` (a number or object) or `[]` (a
list), never missing and never a guess. `mode` is `"jam"` until show mode
exists; `caller` is `null`.

### 2.3 `cue`: `POST /api/rig/cue`

```json
{ "rig": 1, "kind": "cue", "id": "<uuid>", "name": "ping", "args": {},
  "from": { "id": "…", "name": "aylmo" }, "sentAt": 1789560000000 }
```

Response: `{ "rig": 1, "accepted": true, "result": … }` or
`{ "rig": 1, "accepted": false, "reason": "unknown-cue" | "not-allowed" | "duplicate" | "bad-args" }`.
Unknown cue names are **not** errors (HTTP 200, `accepted: false`). The same
`id` seen within 60 s gets `duplicate`. Step-1 mode rule: jam accepts from
anyone.

Built-in cues in step 1: `ping` (result `{ at }`), `reload` (browser outputs
on this member reload), and `show-page` (`args.url`, which must be same-origin
or a path; browser outputs navigate to it).

### 2.4 `blackout`: `POST /api/rig/blackout`

```json
{ "rig": 1, "kind": "blackout", "on": true, "from": { "id": "…", "name": "…" }, "sentAt": 1789560000000 }
```

**Always accepted**, in any mode, from any member of the room. Response
`{ "rig": 1, "blackout": true }`. Only this member's own outputs are affected.
A member never re-broadcasts, so blackout can't loop; "black everywhere" is the
sender calling every member.

### 2.5 `picture`: reserved shape, implemented when the picture engine lands (#447)

```json
{ "rig": 1, "kind": "picture", "streamId": "…", "codec": "h264", "transport": "webrtc",
  "from": { "id": "…", "name": "…" }, "signal": { } }
```

The floor codec is H.264 baseline. In step 1 the route
`POST /api/rig/picture` exists and answers
`{ "rig": 1, "accepted": false, "reason": "not-yet" }`, so the name is claimed
and tolerant.

### 2.6 Members: `GET /api/rig/members`

```json
{ "rig": 1, "self": { …hello }, "members": [
  { "machine": { "id", "name" }, "release", "part", "room", "address": "192.168.88.179",
    "http": { "port", "base" }, "agreed": { … }, "features": { … },
    "lastSeen": 1789560000000, "via": "hello" | "discovery" }
] }
```

A member seen neither by hello nor by discovery for 20 s is dropped.

## 3. Features

`serverXR/src/rig/features.js` exports the local feature table:
`{ card: 1, cue: 1, blackout: 1, members: 1, discovery: 1 }` in step 1.
`agree(a, b)` returns a key for every name present in both tables with
positive-integer values, set to `min(a[k], b[k])`. Non-integer, zero or
negative values are ignored. Code that uses a feature asks `agreed[name] >= n`,
never compares releases.

## 4. Tolerance rules (tests enforce every one)

1. Unknown top-level fields: ignored.
2. Unknown feature names: ignored in `agree`, kept in `members[].features` for display.
3. A future `kind` sent to a known route: 400 with `{ rig: 1, error: "wrong-kind" }` only if `kind` is present and different. A missing `kind` is accepted.
4. Bodies from the future: fixtures in `serverXR/src/rig/fixtures/protocol-1/` (hello, card, cue, blackout, each with extra fields, extra features and extra nested objects) must parse. These fixtures are **append-only**, and a failing fixture blocks the release.
5. Size: a body over 64 KB is refused with 413.
6. Never throw on a malformed discovery packet; count it.

## 5. The room key (optional)

With `DI_RIG_KEY` set, every POST to `/api/rig/*` must carry
`x-di-rig-sig: <hex HMAC-SHA256(key, rawBody)>`, and every discovery packet
carries `sig` over its JSON without `sig`. A mismatch gives 403
`{ rig: 1, error: "room-key" }` and the packet is dropped. `req.rawBody` is
already captured by the server's `express.json({ verify })`. Blackout also
requires the key when one is set: "anyone" means anyone **in the room**.

## 6. Discovery (UDP)

A packet is one JSON datagram ≤ 1 KB:
`{ "rig": 1, "t": "here", "id", "name", "release", "room", "port", "base", "sentAt", "sig"? }`.
It is sent on start and every 5 s to the broadcast address of every up,
non-internal IPv4 interface. On receiving one from an unknown id in the same
room (and not our own id), the member POSTs `hello` to
`http://<source address>:<port><base>/api/rig/hello`. Known ids refresh
`lastSeen`. Discovery is off unless LAN is allowed, and off with `DI_RIG=0`.

## 7. Files and lanes

One owner per file. A lane never creates or edits another lane's files. It
codes against the interfaces below and injects fakes in its own tests.

| lane | branch | owns |
|---|---|---|
| **A · core** | `feat/rig-core` | `rig/protocol.js`, `rig/features.js`, `rig/identity.js`, `rig/routes.js`, `rig/index.js`, `rig/fixtures/protocol-1/*`, their tests, and **one hunk** in `serverXR/src/index.js` mounting `createRig` |
| **B · card** | `feat/rig-card` | `rig/card.js`, `rig/card.test.js`, `rig/probe/*` |
| **C · members** | `feat/rig-members` | `rig/members.js`, `rig/discovery.js`, their tests |
| **D · sinks** | `feat/rig-sinks` | `rig/sinks.js`, `rig/events.js`, their tests, `src/rig/rigEvents.js`, `src/rig/RigBlackout.jsx`, and **one hunk** in `src/map/MapOutput.jsx` |
| **E · grid** | `feat/rig-grid` | `scripts/rig/*`, `.github/workflows/rig-compat.yml` |

### Interfaces

```js
// A — rig/protocol.js
PROTOCOL = 1
readHello(obj)     -> Hello | null        // tolerant, fills defaults (§2.1)
buildHello({ identity, release, part, room, port, base, features, now })
readCue(obj)       -> Cue | null
readBlackout(obj)  -> { on, from } | null
sign(key, rawBody) -> hex ;  verify(key, rawBody, sig) -> boolean (timing-safe)
// A — rig/features.js
LOCAL_FEATURES ; agree(a, b) -> { [name]: int }
// A — rig/identity.js
loadIdentity({ dataRoot, env, hostname }) -> { id, name }
// A — rig/index.js
createRig({ app, dataRoot, env, release, port, base, logger, lighting }) -> { stop() }
//   wires identity + card + members + discovery + sinks + routes; no-op when env.DI_RIG === '0'

// B — rig/card.js
createCardSource({ env, fsRoot = '/', exec, os }) -> { read(): Promise<{ part, partReason, ports, health, shows }> }
//   part: DI_PART wins; else no screen connected and ≤ 2 GB → hands; ≤ 6 GB or ≤ 2 cores → stage; else studio
//   Linux reads /sys/class/drm, /proc/asound, /dev/video*, /dev/tty{USB,ACM}*, /sys/class/thermal|hwmon,
//   /proc/stat, /proc/meminfo, vcgencmd get_throttled (if present); macOS/Windows return nulls/[] honestly
//   must finish < 500 ms; cache 2 s

// C — rig/members.js
createMembers({ now = Date.now, ttlMs = 20000 }) -> { upsert(hello, { address, via }), list(), get(id), expire(), on('join'|'leave', fn) }
// C — rig/discovery.js
createDiscovery({ identity, release, room, port, base, key, udpPort, members, sayHello, interfaces, dgram, logger })
  -> { start(), stop(), stats() }        // sayHello(address, port, base) is injected (A supplies it)

// D — rig/sinks.js
createSinks({ logger }) -> {
  setBlackout(on, from), isBlackout(), onBlackout(fn),
  registerCue(name, handler, { describe }), runCue(cue) -> Promise<{ accepted, reason?, result? }>, cues(),
  events            // EventEmitter: 'blackout' {on, from}, 'cue' {name, args, from}
}
wireLighting(sinks, lighting)   // lighting = registerLightingRoutes' return; never instantiate the desk only to black it out
                                // unless a saved show exists on disk
// D — rig/events.js
registerRigEvents(app, sinks)   // GET /api/rig/events : SSE of blackout / reload / show-page
// D — src/rig/rigEvents.js: subscribe(baseUrl, handlers) ; src/rig/RigBlackout.jsx: a full-window black layer while blackout is on
```

### Rules for every lane

- Branch from `feat/rig-protocol-1`, and work only in your own worktree
  `~/work/di.iiii-rig-<lane>`.
- `node_modules` are symlinks to `/home/dob/work/di.iiii/node_modules` and
  `/home/dob/work/di.iiii/serverXR/node_modules`. Never run `npm install`.
- Tests: `npx vitest run serverXR/src/rig` (server) and
  `npx vitest run src/rig` (client). Also run `npx eslint` on your own files.
- Commit your own paths only (`git add <paths>`, never `-A`). **Do not push.**
  Don't touch `CURRENT.md`, `PROGRESS.md`, or `docs/ai/sessions/`; the lead
  lands it.
- No Playwright and no headless GPU browsers (a GPU crash hard-reset aylmo on
  2026-09-14).
- Report: files, test output, and anything in this contract that was wrong.

## Amendments

### 2026-09-16: integration of lanes A to E (additive only; nothing frozen changed)

1. **`hello.http.scheme` + `hello.http.tls`**: `scheme` is `"http"` (default) or
   `"https"`. `tls` is the certificate's DNS name or `null`. The discovery
   packet carries the same two fields. A peer dials the LAN address with that
   name as TLS `servername`. The name comes from the first non-wildcard DNS SAN
   of `TLS_CERT`.
2. **"Known" member (§6)** means a confirmed hello round trip (`via: "hello"`).
   A member heard only through discovery gets a hello every 10 s until one
   lands. A single lost first hello therefore never strands a pairing.
3. **Card `ports.net[].kind`** is `"wifi"` (a wireless dir), `"ethernet"` (a
   real `device` behind it), or `"other"` (tailscale, docker, veth, tun). An
   interface with operstate `unknown` is `up` when it has an address.
   Disconnected screens are listed with `connected: false`.
4. **Error bodies**: a malformed or refused hello, cue or blackout gets 400
   `{ rig: 1, error: "malformed" }`. Handler failures get 500 `cue-failed` or
   `blackout-failed`. A blackout without `on` means `on: true`; a non-boolean
   `on` gets 400. Precedence: 413 (size) before 403 (key) before 409 (room).
5. **Cue reasons**: a handler throwing an error marked `badArgs` (or
   `code: "BAD_ARGS"`) gives `bad-args`. Any other throw gives `not-allowed` and
   is logged. `show-page` accepts only a same-origin path.
6. **Events**: `GET /api/rig/events` sits behind the same local-runtime guard
   and sends the current blackout on connect (`from: null`).
   `registerLightingRoutes` returns `hasDesk()`, so blackout reaches a desk a
   browser already opened without ever creating one.
7. **Identity**: a corrupt `machine.json` is renamed `.broken-<ts>` and a new id
   is made. That is the only case where the id changes.
8. **Features** with non-integer values (nested objects) are dropped when read.
9. **Grid tools**: `conformance.mjs --room R` speaks from that room; a `card`
   fixture is only parsed, never posted.

Verified on real machines 2026-09-16: aylmo (release 0.4.0 checkout) and asuz
(`0.5.0-rig.1`) in room `rigtest` with a key found each other by discovery,
both ways. Conformance passed 17/17 against each. `compat-grid --refs HEAD,HEAD`
went green. An unsigned cue got 403. A signed blackout from aylmo turned asuz's
projector output from a white test page (mean 253) to black (0) and back.

### 2026-09-24: visibility, the private beacon (additive only; nothing frozen changed)

Found on a real network: three copies on 192.168.88.x, one of them bound to
every interface with `DI_ALLOW_LAN_DEVICES` unset. It was invisible by design
and nothing said so.

1. **`GET /api/rig/visibility`**, behind the same guard, answers
   `{ rig: 1, visible, reason: "open"|"devices-closed"|"loopback", summary,
   discovery: "on"|"listening"|"off"|"port-busy", room, members: <count>,
   nearby: [{ id, name, address, release, open, via, lastSeen }], fix }`.
   `serverXR/src/rig/visibility.js` is the only place it is worked out; `di
   status`, the boot log and the Desk repeat it.
2. **Three discovery modes**, chosen from the bind and the guard:
   `open` (LAN allowed: §6 as written) · `private` (bound to the network,
   device routes closed: listen, beacon, never hello, never file a member) ·
   `off` (loopback bind: no socket on the network at all).
3. **The private beacon**: `{ "rig": 1, "t": "private", "machine": { "id",
   "name" }, "release", "sentAt" }`, ≤ 1 KB, same port and targets as `here`,
   every 5 s. It carries **no top-level `id`**, deliberately: a 0.4.x reader
   never looked at `t` and would have filed any packet with an `id` as a
   member and dialled it; without one it counts it malformed (§4 rule 6).
   Verified 2026-09-24 against aylmo and win on 0.4.16-connect.4: neither
   listed the beaconing copy. Unsigned (it asks nothing of the receiver, and a
   private copy need not hold the room key); heard across rooms.
4. **`t` is read.** A packet whose `t` is neither absent, `here` nor `private`
   is counted (`unknownKind`) and ignored, never treated as `here` (§4).
5. **`nearby`** is di.iiii heard but never paired — a private beacon, an open
   copy heard by a private one, or a peer whose hello answered 403
   "local runtime is loopback-only". Bounded (64), expires with the member TTL
   (20 s), and nothing in it is ever dialled. Its `address` is the first one
   still heard, because one machine broadcasts from every interface.
6. **Why the private beacon is safe** (owner's standing security reason for
   the guard: a device route is an outbound socket others could aim): the
   beacon's content and targets are fixed, and nothing a remote party sends
   makes a private copy send anything or open any route. It discloses id,
   name and release — the name is already on the same address's
   unauthenticated `/api/config`. A loopback copy stays silent: opening a
   socket there would be the first network footprint of a copy that asked
   for none (and a firewall prompt on Windows and macOS). Whether a loopback
   copy should LISTEN (never send) is an owner decision.
