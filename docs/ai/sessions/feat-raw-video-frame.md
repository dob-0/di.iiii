# Video gains a Frame (plan 3.6)

## What changed

- `media.video` now declares a **Frame** output (texture) — the playing
  picture as a wire value, the webcam idiom. A Monitor can watch a Video;
  anything that eats a texture can wear one.
- **VideoFrameFeed** — an invisible editor-level publisher, one per playing
  Video node. The scene only mounts VideoObject in the fullscreen room, but
  a Frame wire must carry the picture wherever the graph is looked at; the
  feed owns the pipeline instead (found by LOOKING: the first cut threaded
  the publish through the viewport, and the Monitor stayed honest-empty in
  canvas view). VideoObject's texture registry is shared and refcounted by
  (source, settings), so the room and the feed stand behind ONE video
  element. `useVideoTextureSource` is now exported for this.
- Colocated `media.video/runtime.js` reads the side channel back; null — no
  frame, not a frozen one — where nothing renders the video (the read-only
  /out shows the video in the scene itself).
- **The anatomy extractor learned colocated runtimes** (this PR's enabling
  infrastructure): `src/project/nodes/<typeId>/runtime.js` is measured
  whole-file with answers extracted, fingerprinted like the three measured
  files, and quotable in the sheet via a Vite glob — the trio/Lag/Noise/Array
  entries stop reading "computes: null".
- Monitor empty-state, manual and wiki: "a Webcam's Frame, for now" → "a
  Webcam's or a Video's Frame".

## Verified

Runtime read (live texture / null), feed publish + clear-on-unmount, full
suite 2519/2519, lint at baseline; SEEN: a seeded Video → Monitor document
on the local build shows the playing footage inside the Monitor window in
canvas view (screenshot read).
