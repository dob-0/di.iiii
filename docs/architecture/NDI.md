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

macOS and Linux library lookup (written from the headers, never run); anything in a
browser — no di.iiii surface has been pointed at these routes yet.

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
