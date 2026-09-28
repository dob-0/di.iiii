## 2026-09-29 — the visualiser: the light desk beside the room, the room drawn from its DMX

Owner: *"our light and scene sync where i can with split screen or with 2 window see the virutal
version and test the lights"*. Method and numbers: `docs/architecture/RIG_BUILD.md` §18;
the stream: `LIGHTING_DESK.md` "The pushed frame".

- ASSUMED test modes for every MOXIR type (`src/rigbuild/assumedProfiles.js`), separate from the real
  (owed) modes, each with its source/page and "ASSUMED … — verify on the rental unit"; kept out of GDTF/MVR.
- `dmxDecode.js` / `dmxPose.js`: DMX → pan/tilt (16-bit, type range), colour (RGBW, wheel, CTO), level,
  shutter/strobe, zoom; DMX wins while the desk is live. `deskLookValues.js`: looks written as DMX.
- `dmxstream.js`: `GET /light/api/dmx/stream` (SSE, key + deltas, 40–44 Hz); the mirror streams.
- `/{space}/visualise/{project}` (`VisualiserSurface.jsx`), the desk's "Visualiser" link, the rig row.
- Fixed on the way: the Studio's `liveLight` re-coloured wheel heads white (known-fixes row).
- Scripts: `assume-modes.mjs` (to/from the assumed modes), `vis-see.mjs` (GPU-only latency + frames),
  `show-loop.mjs` now puts the looks WITH DMX on the desk.
- Tests (targeted): rigbuild + rigMirror + map/lightingLink + RootApp + objectComponents 60 files green;
  desk suites incl. new `test-stream.js` green; lint 0 errors.
- Installed on the owner's machine as `0.4.16-rigbuilder.9` (preview branch = dev 3c7e79b8 + this);
  measured there: API → drawn lamp p50 33.8 / p95 34.8 ms, Art-Net → drawn lamp p50 37.8 / p95 39.4 ms.
- Owed: the real channel lists; gobo/prism/haze drawn; base yaw per lamp; a real console; ponyo run by
  the owner; iGPU numbers.
