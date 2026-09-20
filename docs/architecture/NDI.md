# NDI in di.iiii

**Status: step 1 of the build order — the server side only.** The routes below work on a
local install today. Nothing in the editor mentions NDI yet: there is no `ndi` source
kind, no picker, no schema change. A person can point an `image` surface at the MJPEG
route by hand (see *Trying it*), and that is the whole user-facing story for now.

Design and build order: `~/work/di-atlas/decisions/2026-09-20-native-ndi.md`.

> NDI® is a registered trademark of Vizrt NDI AB — <https://ndi.video>

## What it is

NDI carries video between machines on a local network, at low latency and full quality.
It is how TouchDesigner, OBS, Resolume and most stage software hand each other pictures.
Until now di.iiii reached a TouchDesigner output through OBS + DistroAV + "OBS Virtual
Camera" into a `stream` surface — a chain with four moving parts and a colour conversion
in the middle. This lane talks to NDI directly: the machine that draws the wall receives
the picture itself.

## The licence position — read this before touching the runtime

di.iiii is AGPL-3.0. The NDI runtime is proprietary, and its EULA cannot be sublicensed
under the AGPL. So:

- **we never ship, bundle, vendor or download the NDI runtime.** Not in the repo, not in
  a Docker image, not in an installer, not in a postinstall script.
- **the person installs it** — NDI Tools or the NDI Runtime, from <https://ndi.video> —
  and we `dlopen` whatever is already on their machine. This is exactly the DistroAV
  (obs-ndi) precedent.
- **nothing native is required to run di.iiii.** `koffi` (the FFI) is an
  `optionalDependency` of serverXR; the server boots, and every other feature works,
  with neither koffi nor a runtime present. `serverXR/src/ndiContracts.test.js` is the
  guard: it boots a real server with `require('koffi')` rigged to throw.
- **attribution**: "NDI® is a registered trademark of Vizrt NDI AB" plus a link to
  ndi.video must appear wherever a person picks NDI in the product. Never put "NDI" in
  the name of a di.iiii feature — it describes what we speak, not what we are.
- the struct layouts in `binding.js` are transcribed from the SDK's **headers**, which
  carry their own MIT licence ("applies to this file ONLY and not to the SDK as a
  whole"). Each block in that file names the header it came from.

Still open for the owner: whether to add an explicit AGPL §7 additional permission for
linking the runtime. Nothing in this step depends on the answer.

## Shape

```
browser <--MJPEG--> serverXR (parent)  <--IPC: JPEG buffers-->  forked child
                     ndi/manager.js                              ndi/worker.js
                     routes/ndiRoutes.js                         ndi/binding.js (koffi)
                                                                 the installed NDI runtime
```

- **The library only ever loads in the child** (`child_process.fork`, advanced
  serialization). A segfault inside a proprietary library must cost a restart of that
  child, not serverXR. The parent never requires `koffi` — it only ever
  `require.resolve`s it, to decide whether forking is worth it.
- **The child receives AND encodes.** Raw 1080p RGBA is 8 MB a frame; only JPEG crosses
  the IPC boundary. `sharp` (already a dependency) does the encode.
- **Latest frame wins, everywhere.** Nothing queues — not in the child, not on the
  socket. A slow client is checked with `res.writableLength` and simply skipped. A wall
  shows the present, late or not at all.
- **Ref-counted receivers.** Keyed by (source name, width, bandwidth): the first
  subscriber opens one, the last to leave starts a 5 s linger before it closes, so a page
  reload costs no reconnect. The child exits after 60 s idle; if it dies it is restarted
  with backoff (1 s → 30 s) and subscribers keep their subscription.
- **Local runtime only.** Every route sits behind `requireLocalRuntime` — the same guard
  as the lighting desk. A hosted di.iiii answers **404** (it should not even admit the
  route exists); a local one answers loopback only, unless `DI_ALLOW_LAN_DEVICES=1`.
- **A client may only name a source.** The name is matched against the list the NDI
  finder itself discovered — exact case-insensitive first, then "contains", the same rule
  as `matchStreamDevice` in `src/map/MapSourceView.jsx`. An address from a request is
  never dialled: without that rule this lane would be a connect-anywhere relay.

## Routes

All under `/ndi` and `{APP_BASE_PATH}/ndi`, all local-runtime only, all `no-store`.

| Route | Answers |
| --- | --- |
| `GET /ndi/api/summary` | `{ available, version, reason, how }`. 200 with `available:false` when the runtime is absent — `reason` is `no-koffi` \| `not-installed` \| `load-failed`, and `how` is one plain sentence to fix it. 404 on a hosted tier. |
| `GET /ndi/api/sources` | `{ available, sources: [{ name, address }] }` — what the finder can see right now. |
| `GET /ndi/api/still?name=&w=&bw=` | One JPEG. Waits up to 3 s for a first frame, else 504 with what the receiver is waiting for. |
| `GET /ndi/in.mjpg?name=&w=&fps=&bw=` | `multipart/x-mixed-replace; boundary=di-ndi-frame`. Point an `<img>` at it. |
| `GET /ndi/api/stats` | Receivers, subscribers, restarts, and the child's own timings (recv/copy/encode ms, fps, bytes, dropped). |

`name` is any fragment of a source name, ≤200 characters. `w` is 16–4096 (the picture is
resized before the JPEG — cheaper bytes, more CPU). `fps` is 1–60 (a ceiling, not a
promise). `bw=lowest` asks NDI itself for its low-bandwidth proxy stream, which is by far
the cheapest way to get a small picture — see the measurements.

Environment:

- `DI_NDI_LIB` — an explicit path to the runtime, tried before anything else.
- `DI_NDI_EXTRA_IPS` — comma-separated addresses for the finder, for a network (or a
  Windows firewall) where mDNS does not arrive. Operator-set, never from a request.
- `DI_NDI_ENCODES` — overlapping encodes per receiver, default 2.

## Trying it

Without a camera, TouchDesigner or OBS, on a machine that has the runtime:

```bash
node serverXR/src/ndi/devSender.js --name "di test"      # a moving dark-warm test picture
di up                                                     # or npm run dev
curl localhost:4000/ndi/api/sources
```

Then, in a project, an `image` surface whose ref is:

```
/ndi/in.mjpg?name=di test
```

— or `?name=td_out` for `AYLMO (td_out_windows)`: any fragment of the name resolves, on
the machine that draws. Add `&w=1280` to cap the size the server encodes.

`devSender.js` is also the sender to use when testing anything downstream of this lane
without hardware: 1280x720@30 by default, never white, with a frame counter you can read
in a screenshot.

## Measured, on the stage machine

`win` (i7-8565U, 4 cores/8 threads, NDI 6.3.2.0), sender and receiver on the same box,
JPEG quality 80. Full numbers and method in the PR for `feat/ndi-receive`.

| Source | Out | recv wait | encode | fps out | child CPU (% of one core) |
| --- | --- | --- | --- | --- | --- |
| 720p30 | 1280x720 | 31 ms | 11 ms | 30.0 | 95 |
| 720p60 | 1280x720 | 15 ms | 17 ms | 58.5 | 271 |
| 1080p30 | 1920x1080 | 29 ms | 35 ms | 29.0 | 292 |
| 1080p30 `bw=lowest` | 640x360 | 32 ms | 4 ms | 30.0 | 52 |
| 1080p60 | 1920x1080 | 15 ms | 44 ms | 30.2 | 374 |

Reading: **720p30 is comfortable; 1080p30 works but eats three cores; 1080p60 does not
fit** — it delivers 30 of its 60 frames. JPEG is the cost, not NDI. `bw=lowest` is
essentially free and is the right default for desk previews. Whether a 1080p60 wall needs
the H.264/WebCodecs tier (step 5 of the build order) is decided by these numbers, on this
laptop — a machine with more cores may not need it at all.

## Not verified

macOS and Linux library lookup (written from the headers, never run); NDI across two
machines (sender and receiver were the same box, so mDNS over a real network is
untested); TouchDesigner as the sender; anything in a browser — no di.iiii surface has
been pointed at these routes yet.
