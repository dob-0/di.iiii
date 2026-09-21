# NDI in di.iiii

**Status: steps 1–3 of the build order.** The server receives (step 1), a surface can
name an NDI source and the machines on a desk report the ones they can see (steps 2–3).
Still to come: one WebSocket for many inputs (step 4), and NDI out (steps 6–8).

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

## Not verified

macOS and Linux library lookup (written from the headers, never run). **A live NDI
picture in a browser: still nothing.** Steps 2 and 3 were built and seen on aylmo, which
has no NDI runtime — so what has actually been looked at is every state in the table
above EXCEPT a frame arriving. The `<img>` path, the frame rate it can hold, and whether
`load` fires per part on a multipart stream are all unproven in a real browser.

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
`/ndi/api/stats`. `detail` now says whether the session was ever opened. `no connection
…` means the media port is not reachable from that machine even though discovery is
(check the address in `detail` — the sender chose it — and both firewalls). `connected
… but no picture` means the link is fine and the sender is not producing video this
receiver can show, which would then point at the sender (TouchDesigner under Wine) or at
the colour format, and `bw=lowest` / `COLOR_FASTEST` become worth trying.
