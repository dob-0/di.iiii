## 2026-09-20 — NDI comes in natively: finder, still and MJPEG, server-side only

Step 1 of `~/work/di-atlas/decisions/2026-09-20-native-ndi.md`. serverXR can now receive an
NDI® picture from the network itself, without OBS, DistroAV or a virtual camera in the
middle. Nothing user-facing ships: no source kind, no picker, no schema change, no wiki
entry. An `image` surface pointed at `/ndi/in.mjpg?name=<fragment>` by hand is the only
way to see it, which is enough to prove the native side.

- `serverXR/src/ndi/` — `library.js` finds the runtime the PERSON installed (`DI_NDI_LIB`,
  Windows `%NDI_RUNTIME_DIR_V6%`/`_V5`, macOS `/usr/local/lib` + the SDK folder, Linux
  sonames in the loader path and the usual dirs) and says in one plain sentence what to do
  when it is not there. `binding.js` declares the flat C API for koffi, struct layouts
  transcribed from the SDK's MIT-licensed headers (mirrored in DistroAV), each block
  naming its header. `worker.js` is the forked child that does all of it — the library
  never loads in serverXR's own process. `manager.js` is the parent: ref-counted
  receivers, 5 s linger, 60 s idle exit, crash restart with backoff that keeps
  subscribers. `names.js` holds the match rule, the twin of `matchStreamDevice`.
- `serverXR/src/routes/ndiRoutes.js` — `/ndi/api/summary|sources|still|stats` and
  `/ndi/in.mjpg`, every one behind `requireLocalRuntime`, mounted beside the lighting
  desk in `index.js`. A hosted tier answers 404; a machine with no runtime answers 200
  with `available:false` and how to fix it.
- `devSender.js` — a ~90-line NDI sender (moving dark-warm field, frame counter, never
  white). It is how this was verified with no camera or TouchDesigner, and how anyone can
  test the lane later without hardware.
- The licence position, written down in `docs/architecture/NDI.md`: the runtime is
  installed by the person and NEVER shipped, koffi is an `optionalDependency`, and
  `ndiContracts.test.js` boots a real server with `require('koffi')` rigged to throw to
  prove the server does not care.

Verified for real on `win` (i7-8565U, NDI 6.3.2.0): koffi loads the DLL, the finder sees
the sender, a still came back as a JPEG that was opened and looked at, the MJPEG ran
29.8 fps for 5 s with no gap over 82 ms, and killing the child mid-stream left the parent
up — the client saw one 1.78 s gap and the stream resumed by itself. 720p30 costs ~1 core
and holds 30 fps; 1080p30 holds 29 fps at ~2.9 cores; 1080p60 does not fit and delivers
half its frames. Numbers and the full table are in `docs/architecture/NDI.md` and the PR.

Not verified, and saying so plainly: macOS and Linux lookup (written from the headers,
never run — this machine has no libndi), NDI between two machines (sender and receiver
were the same box, so real-network mDNS is untested), TouchDesigner as the source, and
anything at all in a browser.

## 2026-09-20, later — the two-machine rig: a receiver that never says why

Cross-machine NDI was tried for the first time: TouchDesigner on aylmo (2025, under
Wine), di.iiii 0.4.14-wstream.8 on `win`. Discovery worked across the network once
`DI_NDI_EXTRA_IPS=192.168.15.53` was set — without it the finder reported aylmo's
`10.0.0.122` cable interface, which `win` cannot route to. With it the address was
reachable (TCP to 5960/5961/5962 succeeded on both the LAN and the tailnet address, and
node.exe is allowed through the Windows firewall on both profiles) — and
`/serverXR/ndi/api/still` still answered 504 every time, for both senders, with
`state: "connecting"`, `detail: ""`, `restarts: 0`.

**The sender was stopped before the cause was found**, so the cross-machine failure is
not reproduced and no root cause is claimed. What was done instead is the defect that
made it unfindable: a receiver now says which of the two possible failures it is.

Measured on `win` against the real runtime (NDI 6.3.2.0) while diagnosing, and now in
docs/architecture/NDI.md:

- **the url is what connects.** A deliberately wrong `p_ndi_name` with the right
  `p_url_address` gives video in 38 ms; a NULL name with the right url, 30 ms. A wrong
  or NULL url falls back to resolving the name through the runtime's own discovery and
  still arrives — at ~4.03 s. So the 5 s threshold, and so a machine name that resolves
  to an unusable address (MagicDNS pointing `AYLMO` at the tailnet) is not by itself a
  reason for no picture.
- **the strings are copied.** A receiver built from koffi-marshalled JS strings and one
  built from C memory we allocate and hold behave identically (34 ms to first frame,
  300 frames in 10 s each). There is no pointer-lifetime bug in `recvCreate`.
- **same-machine still passes** on this build: `devSender` → finder → `recvCreate` →
  30.1 fps, `no_connections` 1, first frame 53 ms; through the real routes, a 200 JPEG
  from `/ndi/api/still` and 30 parts in 3 s from `/ndi/in.mjpg?fps=10`.
- **the unreachable case has a clean signature**: `no_connections` stays 0 and
  `recv_capture` returns `NDIlib_frame_type_none` for ever. That is exactly what
  `ndi/diagnose.js` now reports on.

