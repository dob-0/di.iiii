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
  **Code before data, enforced (review fix):** `--apply` now plans every rewrite first,
  then GETs each concrete `/vendor/` file the rewritten pages would fetch (`rewriteHtml`
  returns `fetches`; an importmap prefix contributes the addons the page imports) from
  the target's own origin. One answer that is not 200 and NOTHING is written — the
  refusal names each missing URL and the install/deploy step that fixes it. Proven on
  `:4000`: `--apply` → `REFUSED — http://localhost:4000 does not serve 2 of the /vendor/
  files`, document untouched; on the scratch `:4141` with this branch's dist → `serves
  every /vendor/ file these pages need (13 probed)` and the 13 writes went through.
  **`--restore`** is the way back: PUTs the saved `<project>.document.json` for every
  `--space`/`--project` under `--originals` (dry-run lists, `--apply` writes). Round-trip
  proven on `:4141`: restore → the CDN URLs are back → apply → rewritten again.
- **`scripts/pack-runtime.mjs`** refuses a `dist/` with no `vendor/VENDOR.md` — a pack
  built from a stale or pre-vendor dist would install a server that 404s the rewritten
  pages. Its existing tests (`packProfile`, `runnerDocker`) still pass.

### Data — local tier (`http://localhost:4000`): applied, then RESTORED the same morning

The apply was a mistake in order, and the review caught it: the owner's install
(`0.4.2-offline.7`, no `/vendor/` at all) served the 13 rewritten pages black ONLINE —
`the-light-put-back` stuck at "LOADING THE PHOTOGRAPHS" with `THREE is not defined`,
`ops-board` with `marked is not defined`. The rule applied to staging (code before data)
had not been applied to local. **Restored at 09:52** with
`node scripts/page-vendor-cdn.mjs --tier local --restore --originals <lane>/originals
--space the-light-put-back --space azd --space dilijan --space br-id-ge --apply` — all 13
back to their CDN HTML, verified: every document answers with its cdnjs / jsdelivr URLs
again, and headless Chromium ONLINE against `:4000` paints `/the-light-put-back` (the full
piece, seven stages, the player), `/br-id-ge/ops-board` (the rendered board) and `/azd`
(the models), zero page errors, zero failed requests — screenshots read
(`shots/online-4000-restored/`). So `:4000` is exactly where it was before this lane:
works online, the CDN pages black offline. The Dilijan asset copy (below) stays — it only
turned 404s into 200s.

**The three steps that close the gap on the festival machine, in this order** (the first
is the owner's hand — `di update` on the owner's install is not an agent's to run):

1. Install a build that carries `/vendor/`. `di update` follows GitHub releases, and no
   release from a tree with this branch exists, so it is a file install. The pack is
   already built from this branch (dev after #387, so it carries the offline model work
   too — `serverXR/src/localModelClient.js` is inside) and sits where installers live:
   `di update --from /mnt/data/installers/di-runtime-0.4.2-offline.8.tar.gz`
   (sha256 `6381c00d…7b90795`, `.sha256` beside it; 4.6 MB; the version is the box's own
   series so `--rollback` reads as offline.8 → offline.7). To rebuild it from any tree
   that contains this branch: `DI_PROFILE=local npm run build && node
   scripts/pack-runtime.mjs --no-build --version=0.4.2-offline.9`.
   Check: `curl -sI http://localhost:4000/vendor/three@0.160.0/three.min.js` → 200.
2. `node scripts/page-vendor-cdn.mjs --tier local --space the-light-put-back --space azd
   --space dilijan --space br-id-ge --apply` — the probe passes now, 13 pages rewritten,
   originals saved under `~/di-backups/page-vendor-cdn/local/`.
3. Cut the internet and open `/the-light-put-back`, `/br-id-ge/ops-board`, `/dilijan/the-yard`.

The 13 projects the apply rewrites (and the restore put back):
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

- The festival machine is closed by the three steps above; step 1 is the owner's. Until
  it runs, the CDN pages are black offline there — as they were before this lane, and
  not black online.
- Staging: deploy first (this branch on dev), then the apply command above with
  `--tier staging`; the probe now refuses the wrong order there too.
- `azd`'s Draco decoder path; mediapipe for the two camera works and the rite.
- The mesh websocket on a scratch serverXR logs "closed before handshake" for the camp
  pages — not this lane, noted.
