## 2026-09-21 — a screen in the 3D room shows the real picture of a mapping surface

Step 5 of "one project is one stage" (di-atlas/decisions/2026-09-20-one-project-one-stage.md).

**What a person gets.** In Studio, a plane has a new Screen section with one field, Surface —
a picker listing this project's mapping surfaces by name. Choose one and the plane shows that
surface's live picture as its face: the picture network (`network`), a video, an image, a
camera, a stream, an NDI® source, a test pattern, or a flat colour. Same document, no copy: what
Projection puts on the wall is what the room shows.

**The schema change, the only one.** `components.surface = { surfaceId }` on an entity. Both
mirrors (`src/shared/projectSchema.js`, `shared/projectSchema.cjs`) keep the id and nothing
else, and drop the component when the id is empty, so a plane authored before this is
byte-identical. Proven through the real server in `projectContracts.test.js` ("survives a real
write→read through serverXR") and in `schemaSync.test.js` for the two mirrors.

**How the picture reaches WebGL.** Nothing in the map lane is written twice. `LiveScreens.jsx`
(Studio only, outside the Canvas) mounts one real `MapSourceView` per surface a screen points
at, in a 1px hidden host beside the viewport — so the network runs through `useTopNetwork`, the
video retries through `useRetryingMedia`, the camera and stream open the way the wall opens
them. A `MutationObserver` on the host finds the picture element the map lane produced (canvas,
video, img, the test pattern's svg, or the dim placeholder) and wraps it in a `THREE.Texture`;
`liveScreen.js` is the pure half (which kinds are textures, which are plates, upload rates,
which element wins) and is tested on its own. `EntityContent` takes an optional `screens` map
and hands the plane a `screen`; `PlaneObject` draws it with an UNLIT material (a screen emits
its own light — a lit material shows the picture only where a lamp falls on it, and a dark room
is exactly where a screen is wanted). One source per surface, not per plane: two screens on the
same wall share one decode. A surface nobody shows is not mounted.

**`project` and `url` surfaces are iframes and cannot be textures** (a browser will not hand a
page's pixels to WebGL). A screen showing one draws a dim named plate — `url · Wall left` /
`a page, not a picture` — painted with the `--di-card-*` tokens read from the stylesheet, the
same amber-on-near-black card a new surface is born showing. A surface that is gone, and a
screen before its source has painted, get the same plate with their own words. Nothing in this
change puts white in a room.

**Texture upload is rate-capped** (`LIVE_SCREEN_RATES`): the picture network at 15/s, an NDI®
image at 30/s, a still image and a test pattern once, from one rAF clock. A `<video>` (video,
camera, stream) is three.js's `VideoTexture`, which uploads once per frame the browser presents
(`requestVideoFrameCallback`) and never faster than the source — and it is the only texture that
can read a `<video>` at all: a plain `Texture` sizes its upload from `image.width`, which a
`<video>` reports as 0, and the GPU logs `glTexStorage2D: dimensions are not positive` and draws
black. Seen on both SwiftShader and the Intel GPU before the switch; isolated in a bare page.

**Measured** — see the PR body for the frame-time numbers (headless Chromium, software GL).

**Not done, on purpose.** Screens run in Studio only: `LiveProjectScene` (published rooms, walk
mode) still draws the plane's plain colour, because a visitor's browser would otherwise open
cameras and run every operator of a room it only walks through. Low-power preview cards skip
the sources too (a screen there is its dim plate). A `video`/`image` surface whose ref is an
absolute cross-origin URL without CORS would taint the upload — the map lane's `<video>` sets no
`crossOrigin`; project assets are same-origin, so the ordinary case is fine, and the typed
web-address case is untested here.

**Found on the way, not part of the change.** This worktree's `node_modules` was a Sep 6
install (`@vitejs/plugin-react` 6.0.5 against a lockfile wanting 6.1.1); Vite's pre-bundle
then produced two `react-dom` chunks and every page threw "Invalid hook call" before a line
of this branch ran. `npm install` fixed it. `VITE_PORT` does not move Vite (the run skill
already says so); `npx vite --port 5373 --strictPort` beside a `PORT=4373` serverXR does.
