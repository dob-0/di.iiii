## 2026-09-07 — published pages load their libraries from /vendor/, not a CDN

The festival-machine inventory (`docs/testing/FESTIVAL_MACHINE_2026-09-06.md`) found
`the-light-put-back`, `azd`, the Dilijan camp works and br_id_ge's field black offline:
their HTML pulls three.js, Leaflet, cannon-es, marked and es-module-shims from cdnjs /
unpkg / jsdelivr. This branch is the platform half plus the tool; the data changes are
applied on the local tier and reported here, not committed.

### What changed (code)

- **`public/vendor/`** — pinned copies at the exact versions the pages use: three r128
  UMD, three 0.160.0 UMD + ESM + `examples/jsm/{loaders/GLTFLoader,loaders/DRACOLoader,
  controls/OrbitControls,utils/BufferGeometryUtils}.js`, three 0.166.1 ESM +
  `RoomEnvironment.js`, cannon-es 0.20.0, es-module-shims 1.8.0, leaflet 1.9.4 (js, css,
  images), marked 15.0.12. `VENDOR.md` there lists every file, source URL, version and
  sha256. 3.4 MB on top of the 740 KB already there; 4.1 MB in all. Layout is
  `<package>@<version>/…`, add a version, never overwrite one.
  Skipped on purpose: @mediapipe/tasks-vision (10 MB wasm + models from Google storage —
  `dilijan/anahit-vachagan`, `dilijan/aircanvas` and the rite keep needing internet),
  Google Fonts (not a library), map tiles.
- **One location, proven.** The previous attempt hesitated between `public/vendor/` and
  `serverXR/public/vendor/`. `serverXR/public/` holds only the fallback index; the tiers
  serve `dist/` (vite copies `public/` in) and a `di` install serves `CLIENT_DIR=dist`
  through serverXR's static mount. So the files live in the root `public/vendor/` where
  `three.module.min.js` already was, and `vite.config.js` adds `vendor` to
  `LOCAL_PUBLIC_INCLUDE` so the local-profile build carries it. Measured: `DI_PROFILE=local
  npm run build`, a scratch serverXR on :4141 with that dist, `/vendor/three@0.160.0/
  three.min.js` → 200 `text/javascript` with `Access-Control-Allow-Origin: *`.
  The owner's install on :4000 (0.4.2-offline.7) has NO `/vendor/` at all (404 even for
  the old `three.module.min.js`) — it was built before `vendor` was in the include list.
  It needs a rebuild from this branch before the rewritten pages paint there.
- **`scripts/page-vendor-cdn.mjs`** (+ test, 21 cases). `--tier local|staging` (no prod
  entry, `--api` refuses di-studio.xyz), `--space`/`--project`, dry-run by default,
  `--apply` saves every rewritten project's original HTML + whole document JSON first
  (`--originals`, default `~/di-backups/page-vendor-cdn/<tier>/<space>/`). Rewrites ONLY
  `<script src>`, `<link href>` and importmap values it knows; anything else on a CDN
  (a URL inside JavaScript, an unknown library) is left and printed. Google Fonts links
  are KEPT by default and reported — dropping them restyles a page that works online
  and offline the fallback face shows either way; `--drop-fonts` removes them. The test
  asserts every map target exists under `public/vendor/` and that `VENDOR.md` names every
  file, so the map and the directory cannot drift apart.

### Data — local tier (`http://localhost:4000`), APPLIED

13 projects rewritten (originals under the lane's `originals/local/`):
`the-light-put-back/the-light-put-back` · `azd/azd` · `dilijan/{elevation,
anahit-vachagan, mushroom-house, the-yard, dilijan-drive}` · `br-id-ge/{newww,
br-id-ge-field, br-id-ge-graph, v-oooooo, br-id-ge-guide, ops-board}`.
Left in place and reported: `azd` sets the Draco decoder path to jsdelivr inside its
JavaScript (`setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/
libs/draco/')`, and its model IS draco-compressed); mediapipe in `anahit-vachagan`,
`aircanvas`, `newww`.

The Dilijan camp assets: 18 files (6.5 MB — the-yard's point cloud and photos,
elevation's mesh, mushroom-house / orange-room / tsaghkanots data, worlds' seven
thumbnails) were 404 on the local tier because they are referenced only from the pages'
HTML, never from `document.assets[]` — so `tier-sync` and `project-pull` (which move
`assets[]`) report "nothing missing". Copied file-level from staging into the tier's
`spaces/dilijan/blobs/<sha256>` + `projects/<id>/assets/<sha256>.json`, each file's
sha256 checked against its id before writing, nothing overwritten, no document touched
(the API upload route re-encodes JPEGs and would have changed their ids). Every asset ref
in every dilijan page now answers 200 on :4000.

### Verified offline (headless Chromium, every non-localhost request aborted)

Against the scratch serverXR on :4141 (this branch's dist + a snapshot of the tier with
the same rewrites and assets), screenshots read: `/the-light-put-back` paints the full
piece (three 0.160 from /vendor/); `/br-id-ge` landing, `/br-id-ge/br-id-ge-field`
(three 0.166.1 ESM via the rewritten importmap), `/br-id-ge/ops-board` (marked),
`/br-id-ge/v-oooooo` (three r128 + marked); `/dilijan` room, `/dilijan/worlds` with its
seven thumbnails, `/dilijan/{elevation, the-yard, mushroom-house, dilijan-drive,
orange-room, tsaghkanots}` all paint. `/dilijan/anahit-vachagan` is blank (mediapipe,
expected). `/azd` is black offline — only because of the Draco decoder URL in its
JavaScript; online on the same server it paints with every library from /vendor/. A
one-line page edit (`setDecoderPath('/draco/')`, the platform ships the decoder there)
would finish it — the owner's call, not done here.

### Staging — dry-run only, NOT applied

Same 13 projects, same diff. Held because staging does not serve `/vendor/three@0.160.0/…`
until this branch deploys (nginx answers 404 there today) — applying now would black the
pages online (memory: code before data). After the deploy:
`node scripts/page-vendor-cdn.mjs --tier staging --space the-light-put-back --space azd
--space dilijan --space br-id-ge --apply`. Prod is the owner's word.

### Still open

- The owner's `di` install needs a build from this branch to have `/vendor/` at all.
- `azd`'s Draco decoder path; mediapipe for the two camera works and the rite.
- The mesh websocket on a scratch serverXR logs "closed before handshake" for the camp
  pages — not this lane, noted.
