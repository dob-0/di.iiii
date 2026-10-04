## 2026-10-04 — the room gets a Lite output for phones and visitors; the work machine keeps Full

- Emily's call: the work side (building and simulating the show) may be heavy, the output must run everywhere, phones included, because at show time this system runs the lights.
- Output mode (`src/project/viewport/outputMode.js`, `useOutputMode.js`): Lite keeps every beam cone, the lens and the haze, carries the light on the room with a 4-slot light pool, and drops shadows, bloom, the floor surface model and antialias at DPR 1; the saved document is never written, the viewer draws a copy.
- Who gets which: a coarse pointer or a non-local address gets Lite, the local work machine with a mouse gets Full; `?quality=full|lite` and the Full/Lite button under Walk / Fly (remembered per browser) override; walk mode follows the same choice.
- Decided from the hostname before the first frame on purpose: waiting for `/api/config` remounted the renderer mid-compile (PublicProjectViewer tests caught it as detached nodes).
- Measured on the AMD 860M with the frame cap off, Known · full (70 lamps): Full on a desktop still blank after 60 s of shader compiles; Lite 418 fps desktop, 239 fps at a phone viewport, following the desk's cues (Vista → Red room → Forest).
- Carries the two 2026-10-03 perf commits that were still local: background shader warm-up, spot lamps skipped outside their cone, quality-governor steps that stick.
- The DMX never depends on any screen: `serverXR/src/lighting/desk.js` sends at 40 Hz on its own timer.
- Wiki: new entry "Lite and Full — a room light enough for a phone".
- Still open: Lite's floor reads black (no surface model) — a cheap glow under the beams is the next step; not yet measured on a real phone.
