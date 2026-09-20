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
