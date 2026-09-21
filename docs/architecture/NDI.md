# NDI in di.iiii

**Status: steps 1–3 and 6–8 of the build order.** The server receives (step 1), a
surface can name an NDI source and the machines on a desk report the ones they can see
(steps 2–3), and a picture di.iiii drew can be broadcast back out (steps 6–8). Still to
come: one WebSocket for many inputs (step 4).

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

## The surface — a source kind named `ndi`

A projection surface's source is `{ kind, ref }`, and for `ndi` the **ref is the source's
NAME** — `AYLMO (td_out_windows)`, or any fragment of it. Matching is exact
case-insensitive first, then "contains", so `td_out` is enough.

**Why a name and not an address.** The mapping is made on the desk and resolved on the
machine that draws the wall, and those are different machines on a rig. An NDI address is
chosen by the SENDER — it advertises whichever of its own interfaces it likes, and on a
machine with a cable, a wifi and a tailnet that choice changes between nights. A name
survives it. This is the same model the `stream` surface already uses for a camera label,
for the same reason (a device id belongs to one browser profile on one machine).

**One matching rule, three callers.** `src/shared/nameMatch.js` (`pickByName`,
`pickByLabel`) is the rule; `shared/nameMatch.cjs` is its CJS twin for serverXR, and
`src/shared/nameMatch.test.js` runs both over one table so they cannot drift. The wall
(`matchStreamDevice`, `MapNdiSource`), the desk's warning (`inputOnMachine`,
`ndiOnMachine`) and the server (`serverXR/src/ndi/names.js`) all go through it. It is two
files rather than one because serverXR is CommonJS and Vite's dev server hands a local
`.cjs` to the browser untransformed — `vite build` bundles one fine, `vite dev` does not
(checked 2026-09-20).

### What the surface says when there is no picture

`MapNdiSource` probes `/ndi/api/summary` the way `lightingLink.js` probes the lighting
desk — **200 AND `content-type: application/json`**, because a hosted tier serves the
app's own index.html for every address it does not know. Then it draws
`/ndi/in.mjpg?name=…&w=…` into an `<img>`, through `useRetryingMedia`, so a sender that
starts after the page is picked up with no reload.

Until a frame paints, the surface shows the same dim placeholder every unfinished source
shows — never black, never white — and what it says is **the server's own sentence**:

| State | What the surface says |
| --- | --- |
| the probe has not answered | `looking for it…` |
| the /ndi routes 404 (a hosted di.iiii) | `this di.iiii cannot receive NDI` — and it stops asking |
| the runtime is not installed | `NDI is not installed on this machine` — then a dash and the `how` that `/ndi/api/summary` returns, verbatim |
| the finder has never seen that name | `no NDI source called “…” on this network` |
| a source resolved and stayed silent | the receiver's own `detail` — which names the address it dialled and says whether the session was ever opened |

There is deliberately no second vocabulary for any of these. `ndiLink.js` is the one place
that turns a refusal into a sentence, and it repeats what the server said rather than
paraphrasing it — a paraphrase would lose the address, and the address is the whole story
on a machine with three interfaces.

## The machines know their NDI

`readMachineDevices` (`src/project/tops/machineDevices.js`) appends one device of kind
`ndi` per source the machine's own serverXR can see. The probe has a 1.5 s leash and
swallows every failure: **a machine with no NDI reports nothing, and nothing is the
ordinary case.** Those entries travel on the presence message every machine already
sends, so the desk can answer "can the machine that draws the wall show this?" before it
is a black rectangle in another room — `ndiSourceOptions` fills the picker's datalist,
`ndiSourceStatus` writes the line under it, and `unresolvedInputs` puts a warning in the
Machines section for a name no machine can resolve.

The hub's `DEVICE_KINDS` gained `ndi`, and **the device cap is now per kind**
(`MAX_DEVICES = 32` each, `MAX_DEVICES_TOTAL = 96`). It was one shared ceiling of 32, and
a festival LAN advertising thirty sources would have pushed out whatever came after them
— which, since `readMachineDevices` appends screens before NDI, would have been the panel
sizes the desk lays a wall out from.

### The mixed-version trap

`MAPPING_SOURCE_KINDS` is a closed list and `normalizeMappingSurface` rewrites a kind it
does not know back to the default. So on a rig where the desk has `ndi` and the wall does
not, the first write from the old side turns the surface into a test pattern and keeps
only the ref. **Both machines have to be on a build that has the kind.** (An unknown
*ref* survives byte-identical, which is why the dim identification card was added as a ref
and not a kind.) Asserted in `src/map/mappingState.test.js`.

## Out — di.iiii as a source

The receive lane pointed the other way. It is what makes di.iiii a **source for other
software**: Resolume, OBS, a media server, a second di.iiii, anything on the network
that speaks NDI can take a picture di.iiii generated.

It is worth being clear about what this is NOT for. On a di.iiii rig the patch itself
already travels — the document replicates, and the machine at the wall runs the same
operators and draws them natively, at full quality with no encoding anywhere. NDI out is
for the machine that CANNOT run the patch, and for the programs that are not di.iiii.

```
browser (the TOP engine)  --POST one JPEG-->  serverXR (parent)  --IPC-->  forked child
  a top.send node              /ndi/out.jpg    ndi/sendManager.js         ndi/sendWorker.js
                                                                          the installed runtime
```

**The browser is the pacer, and the response is the throttle.** A page holds at most one
POST in flight per output; while it is unanswered, later frames are dropped rather than
queued. A machine that cannot keep up therefore sends fewer frames instead of falling
further and further behind, and no buffer anywhere grows. This is the same "latest frame
wins" rule the receive lane follows, enforced by the only mechanism a browser reliably
has.

**An output is born from its first frame and dies when frames stop.** There is no
ref-counting here and no linger, because there is exactly one publisher and no
subscribers — and because a page that is closed simply stops posting. No browser has a
close beacon worth trusting, so silence is the only honest signal, and five seconds of
it closes the source. The child exits after 60 s with no outputs; a child that crashes is
restarted with the same 1 s → 30 s backoff, and every live output is re-opened in the new
child, so a crash is a hiccup for whoever is still posting rather than a source that has
to be re-made.

`clock_video` is **false** on a sender we create. `devSender.js` sets it true on purpose
— there the runtime is the pacer and a blocking `sendVideo` is exactly what paces it —
but here a blocking send would back the IPC pipe up behind a browser that is already
pacing itself.

### The first frame is answered before the truth is known

`probeNdi()` is deliberately cheap — it resolves koffi and looks for a file — so on a
machine where koffi is installed and the runtime is not, the probe passes and only the
forked child discovers the truth. **The first POST is therefore answered `{ ok: true }`
and the frame goes nowhere.** Every frame after it gets 503 with the reason, within one
frame (about 30 ms at 30 fps), and the output that was opened optimistically is gone
from `/ndi/api/outputs` again.

This is a trade, not an oversight: blocking the first request until a forked child has
loaded a native library would stall the page that is trying to draw. Seeing one `ok`
followed by refusals is the designed behaviour, and worth knowing before someone spends
an afternoon on it.

### Who is watching

`NDIlib_send_get_no_connections()` is the send-side twin of the receive lane's
`recv_get_no_connections`, bound leniently so an older runtime that lacks the symbol
still works (the count is then `null`, and the sentence simply leaves it out). It is
polled once a second and travels on a `state` message only when it changes.

**Nothing watching is the ordinary case**, not a fault — a source sits on the network
until somebody picks it — and the sentence says so in those words rather than reporting
zero and leaving a person to wonder what they broke.

### A mixed-version rig is safe here, unlike the source kinds

The receive lane has a real trap: `MAPPING_SOURCE_KINDS` is a closed list and a build
that does not know a kind rewrites the surface back to the default, so a desk ahead of
its wall can flatten a mapping. **A node TYPE behaves the opposite way.** Checked by
running it, not by reading: `normalizeProjectNode` keeps an unknown `typeId` and its
values byte-intact (the schema accepts any typeId without validation, and says so at
`shared/projectSchema.cjs:8`), and `topEngine` filters a type it does not know out of
the network rather than failing on it.

So on a rig where one machine has `top.send` and the other does not, the Send Out node
survives every edit from the older side; it simply draws nothing and sends nothing
there. Upgrade the sending machine and it starts working, with the name it was given.

### One thing to keep an eye on

`top.send`'s name is the TOP vocabulary's first **text** parameter. It is safe without
any engine change because `topEngine.js` skips a parameter whose `p_<name>` uniform the
shader does not declare. That safety lasts exactly as long as no fragment declares
`uniform float p_name` — a person editing the Send Out shader from inside could add one,
and `gl.uniform1f` would then upload `NaN`. Harmless today (the fragment is a
pass-through), but it is the kind of thing that is obvious once and never again.

### Measured, on the stage machine — 2026-09-21

`win` (i7-8565U, NDI 6.3.2.0). The send lane broadcasting 640×360 JPEGs while the same
machine's installed di.iiii received them back through the real runtime:

| | |
| --- | --- |
| discovered by the receiver as | `DESKTOP-MGGLB2C (di picture)` at `10.10.10.2:5961` |
| frames sent / dropped / decode errors | 631 / 0 / 0 |
| JPEG decode (sharp, per frame) | 3.23 ms, peak 5.78 ms |
| `NDIlib_send_send_video_v2` | 0.59 ms, peak 0.77 ms |
| the picture came back as | 200 `image/jpeg`, 8 691 bytes |
| viewers, with a receiver attached | 2 — and 0 before and after it |

Reading: **the send itself is free; the JPEG decode is the whole cost**, which is the
mirror image of the receive lane, where the JPEG encode was. A lane that carried raw
pixels from the browser instead would skip both — worth doing only if a measurement
demands it, because raw 1080p is 8 MB a frame and the POST is the pacer.

## Attribution — a licence condition, not decoration

Wherever a person picks NDI in the product, two things appear beside the picker: a link to
<https://ndi.video> and the line **NDI® is a registered trademark of Vizrt NDI AB**. They
are the terms on which we may name NDI at all, given that we never ship its runtime.
`MapInspector.test.jsx` guards both. Never put "NDI" in the name of a di.iiii feature — it
describes what we speak, not what we are.

## Routes

All under `/ndi` and `{APP_BASE_PATH}/ndi`, all local-runtime only, all `no-store`.

| Route | Answers |
| --- | --- |
| `GET /ndi/api/summary` | `{ available, version, reason, how }`. 200 with `available:false` when the runtime is absent — `reason` is `no-koffi` \| `not-installed` \| `load-failed`, and `how` is one plain sentence to fix it. 404 on a hosted tier. |
| `GET /ndi/api/sources` | `{ available, sources: [{ name, address }] }` — what the finder can see right now. |
| `GET /ndi/api/still?name=&w=&bw=` | One JPEG. Waits up to 3 s for a first frame, else 504 with what the receiver is waiting for. |
| `GET /ndi/in.mjpg?name=&w=&fps=&bw=` | `multipart/x-mixed-replace; boundary=di-ndi-frame`. Point an `<img>` at it. |
| `GET /ndi/api/stats` | Receivers, subscribers, restarts, and the child's own timings (recv/copy/encode ms, fps, bytes, dropped). `out` carries the same for the send lane, and is `null` until a page has actually sent something — asking never forks a sender. |
| `POST /ndi/out.jpg?name=` | One JPEG, the body. → `{ ok, name, seq, viewers }`. 503 names the missing runtime, 429 means the output cap, 400 means the body is not a JPEG. |
| `DELETE /ndi/out.jpg?name=` | Stop that output now, rather than waiting out its five seconds of silence. |
| `GET /ndi/api/outputs` | `{ available, reason, how, outputs: [{ name, state, detail, viewers, frames, dropped, width, height }] }`. |

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

## When there is no picture

A receiver that has resolved a source and then sits silent must say which of two
different things went wrong, because they are different jobs for whoever is at the rig.
`NDIlib_recv_get_no_connections()` is the number that separates them, and
`ndi/diagnose.js` turns it into a sentence that lands in `/ndi/api/stats`, in every
`onState`, and in the body of the 504 from `/ndi/api/still`:

| `no_connections` | What it means | What `detail` says |
| --- | --- | --- |
| 0 | the runtime never opened a session — discovery found the name, the media port was never reached | `no connection to "…" at <address> after N s — … firewall … route …` |
| ≥ 1 | the session is open and nothing showable is coming down it | `connected to "…" at <address> but no picture in N s` |
| — | this runtime has no such entry point | `… this NDI runtime cannot say whether the connection was opened` |

The **address** travels with the name everywhere, because the SENDER chooses it — it
advertises whichever of its own interfaces it likes, and on a machine with a cable, a
wifi and a tailnet that choice is the whole story. `DI_NDI_EXTRA_IPS` (comma-separated,
an operator's env var) asks those addresses directly when mDNS does not arrive, and it
is also what decides which address discovery ends up reporting.

`DI_NDI_NO_PICTURE_MS` moves the threshold; the default is 5000 ms and it is measured,
not guessed — see below.

### How the runtime resolves a source — measured on `win`, NDI 6.3.2.0, 2026-09-20

Four receivers against one `devSender.js`, first-frame latency each time:

| `p_ndi_name` | `p_url_address` | First video |
| --- | --- | --- |
| the discovered name | the discovered address | 34–53 ms |
| **a name nothing advertises** | the discovered address | **38 ms** |
| `NULL` | the discovered address | 30 ms |
| the discovered name | `NULL` | 4035 ms |
| the discovered name | **`127.0.0.1:1`** | **4034 ms** |

Reading: **the url is what connects.** The name is only a fallback, and taking it costs
~4.0 s while the runtime resolves the source through its own discovery. That is why the
"no picture" threshold is 5 s: anything shorter would libel a slow-but-healthy fallback.
It also means a machine whose *name* resolves to an address it cannot use (a tailnet
entry from MagicDNS, say) is not by itself a reason for no picture — the url is tried
first.

The same run showed the strings are **copied** by the runtime: a receiver built from
plain JS strings marshalled by koffi and one built from C memory we allocate and hold
behave identically (34 ms vs 34 ms, 300 frames each in 10 s). There is no pointer
lifetime problem in `recvCreate`.

## Seen, on the rig — 2026-09-21

The receive lane carries a real picture. On `win` (NDI 6.3.2.0), with di.iiii's own
`devSender.js` as the source and no TouchDesigner and no OBS anywhere:

- the finder resolved it as `DESKTOP-MGGLB2C (di test)` at `10.10.10.2:5961`;
- `GET /ndi/api/still?name=di test&w=960` answered **200 `image/jpeg`, 41 242 bytes**;
- `GET /ndi/in.mjpg?name=di test&w=640&fps=15` delivered **77 parts in 6 s**, 866 545
  bytes, boundaries intact — so the multipart stream repeats, which had never been
  checked;
- the receiver reported `state: "live"`, `dropped: 0`, `encodeErrors: 0`, `recvFps: 30`,
  `encodeMs: 8.4` (peak 11.7), `bytesPerFrame: 11 243` at 640×360 — in line with the
  720p30 row of the table above.

A **sender that dies with its ssh session** is what made this look like a discovery
failure for an hour: Win32-OpenSSH tears down the process tree when the session closes,
so a sender started in one `ssh` call is gone before the next one asks for sources, and
the finder correctly reports nothing. Start the sender and probe it in the SAME session.

## Not verified

macOS and Linux library lookup (written from the headers, never run). A live NDI picture
**in a browser `<img>`** — the wire is proven, the page is not; nothing has confirmed
that `load` fires per part or what frame rate the element holds.

**aylmo has no NDI runtime**, so nothing native can be sent or received there yet. The
only NDI binary on that machine is the Windows `Processing.NDI.Lib.x64.dll` that ships
inside TouchDesigner's Wine prefix, which a native Linux process cannot load. `avahi` is
installed and running, so the mDNS half is already in place; what is missing is
`libndi.so.6`, and on Arch that is the AUR package `ndi-sdk` (or `distroav`, which pulls
it in and gives OBS an NDI plugin at the same time). Both fetch the same official
binary from `downloads.ndi.tv`. Installing it is the owner's call: it carries Vizrt's
own EULA, which is exactly why di.iiii never ships it.

**NDI across two machines is still not proven.** On 2026-09-20 di.iiii on `win`
discovered both of aylmo's TouchDesigner senders across the network (with
`DI_NDI_EXTRA_IPS=192.168.15.53`, which changed the advertised address from aylmo's
unroutable `10.0.0.122` cable interface to its wifi one), TCP to 5960/5961/5962 succeeded
on both the LAN and the tailnet address, the Windows firewall had node.exe allowed on
both profiles, and `/ndi/api/still` answered 504 every time for both sources with
`state: "connecting"` and no reason at all. The child never crashed (`restarts: 0`).
The sender was stopped before the cause could be found, so the cross-machine case was
never reproduced with the diagnosis in place.

What the next attempt does, in one step: start the sender, ask for a still, then read
`/ndi/api/stats`. It no longer needs TouchDesigner at either end — `devSender.js` is a
sender, and the machine that lacks a runtime is now the one to fix. `detail` now says whether the session was ever opened. `no connection
…` means the media port is not reachable from that machine even though discovery is
(check the address in `detail` — the sender chose it — and both firewalls). `connected
… but no picture` means the link is fine and the sender is not producing video this
receiver can show, which would then point at the sender (TouchDesigner under Wine) or at
the colour format, and `bw=lowest` / `COLOR_FASTEST` become worth trying.
