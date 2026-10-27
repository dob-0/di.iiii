# /vendor/ — pinned copies of the libraries published pages load

A published page is HTML kept in a project document and rendered in a srcdoc
iframe. Several of them load their libraries from cdnjs / unpkg / jsdelivr,
which is fine on the web and black on a laptop with no internet (measured on
the festival machine, `docs/testing/FESTIVAL_MACHINE_2026-09-06.md`). This
directory holds each of those libraries at the exact version the pages use;
`scripts/page-vendor-cdn.mjs` rewrites a space's pages to load from here.

Served at `/vendor/<path>` by nginx on the tiers (vite copies `public/` into
`dist/`) and by serverXR's `CLIENT_DIR` static mount on a `di` install
(`LOCAL_PUBLIC_INCLUDE` in `vite.config.js` copies it into the local build —
`serverXR/public/` is not involved, it holds only the fallback index), both with
`Access-Control-Allow-Origin: *` so an ES module import from a page's
null-origin frame is allowed. Measured 2026-09-07 on a `DI_PROFILE=local` build
served by a scratch serverXR: `/vendor/three@0.160.0/three.min.js` → 200,
`text/javascript`, the header present.

Layout is `<package>@<version>/<file>`, one directory per pinned version, so a
page that needs r128 and a page that needs 0.166.1 never fight over a name.
Add a version, never overwrite one: a page written against 0.160.0 was tested
against 0.160.0.

## Files

sha256 is of the file as downloaded on 2026-09-06 (`sha256sum`).

| file | source | version | sha256 |
|---|---|---|---|
| `three.module.min.js` | `node_modules/three/build/three.module.min.js` (commit 1eb21a14, network space) | 0.185.1 | `86bcee248b64f44bcfc23c331ae74619061957d59cab040171dcb6fb5900beb6` |
| `three.core.min.js` | `node_modules/three/build/three.core.min.js` (same) | 0.185.1 | `05b2609338c76cd65daf74f3ac515bc9a5045e1b3b33edc07d8c9bd55250fa90` |
| `three@0.128.0/three.min.js` | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js | r128 (UMD) | `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2` |
| `three@0.160.0/three.min.js` | https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js | 0.160.0 (UMD) | `170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa` |
| `three@0.160.0/three.module.min.js` | https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js | 0.160.0 (ESM) | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| `three@0.160.0/examples/jsm/loaders/GLTFLoader.js` | https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js | 0.160.0 | `d073b438e6a07e1359741dd5d6c76c953420cc0d4fd84eb1bdde94315540e6a3` |
| `three@0.160.0/examples/jsm/loaders/DRACOLoader.js` | https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js | 0.160.0 | `65c114ecb7b349cdc59c75b2c92d19cca672a138060dba0f60f64262fa40408c` |
| `three@0.160.0/examples/jsm/controls/OrbitControls.js` | https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js | 0.160.0 | `5a44a9e86a2a0fb11933eed69bc2cd33c76a496854c1aed6ed776efa87d7b064` |
| `three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js` | https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js (GLTFLoader imports it) | 0.160.0 | `9be041e96308775d00e2695cc607645b9a9b64fd7c0e759dd8f7c00a8d92becb` |
| `three@0.166.1/three.module.min.js` | https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.min.js | 0.166.1 (ESM) | `54f21cfd2d0251ad8a406fb94f290c8c8086303f20ebdbf2f261edf5f55d5e96` |
| `three@0.166.1/examples/jsm/environments/RoomEnvironment.js` | https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/environments/RoomEnvironment.js | 0.166.1 | `e1b92c4dd2d89752293546790bfda9828a630a79700c66f5b736fad7a88cb7e4` |
| `cannon-es@0.20.0/cannon-es.js` | https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js | 0.20.0 (ESM) | `f0700cbd3a482954949b9d58c1b0f76dcc74767750297647a39d8c40dd63d37c` |
| `es-module-shims@1.8.0/es-module-shims.js` | https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js | 1.8.0 | `13aefc6bda2f56b3f2aa2ade4e6d3ce1112d4b5f6140ed9b4f292a2131d1245d` |
| `leaflet@1.9.4/leaflet.js` | https://unpkg.com/leaflet@1.9.4/dist/leaflet.js | 1.9.4 | `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a` |
| `leaflet@1.9.4/leaflet.css` | https://unpkg.com/leaflet@1.9.4/dist/leaflet.css | 1.9.4 | `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6` |
| `leaflet@1.9.4/images/layers.png` | https://unpkg.com/leaflet@1.9.4/dist/images/layers.png (the css asks for it) | 1.9.4 | `1dbbe9d028e292f36fcba8f8b3a28d5e8932754fc2215b9ac69e4cdecf5107c6` |
| `leaflet@1.9.4/images/layers-2x.png` | https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png | 1.9.4 | `066daca850d8ffbef007af00b06eac0015728dee279c51f3cb6c716df7c42edf` |
| `leaflet@1.9.4/images/marker-icon.png` | https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png | 1.9.4 | `574c3a5cca85f4114085b6841596d62f00d7c892c7b03f28cbfa301deb1dc437` |
| `leaflet@1.9.4/images/marker-icon-2x.png` | https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png | 1.9.4 | `00179c4c1ee830d3a108412ae0d294f55776cfeb085c60129a39aa6fc4ae2528` |
| `leaflet@1.9.4/images/marker-shadow.png` | https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png | 1.9.4 | `264f5c640339f042dd729062cfc04c17f8ea0f29882b538e3848ed8f10edb4da` |
| `marked@15.0.12/marked.min.js` | https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js (the pages ask for unpinned `marked/marked.min.js`; this is what jsdelivr resolved it to on 2026-09-06) | 15.0.12 | `3e7e7d7feb3e5d58cb6c804f68ab5c24cc7e5eb6270fd6e5cbb9124739217d0c` |

3.4 MB added on top of the 740 KB that was already here; 4.1 MB in all.

## What is deliberately not here

- **@mediapipe/tasks-vision 0.10.14** — the wasm bundle alone is ~10 MB and the
  models it loads come from storage.googleapis.com; `dilijan/anahit-vachagan`,
  `dilijan/aircanvas` and `br-id-ge/newww` (the rite) keep needing the internet
  for their camera tracking.
- **Google Fonts** — a webfont CSS request, not a library. The rewrite tool
  leaves the `<link>` and reports it (offline the page falls back to its own
  face stack either way); `--drop-fonts` removes it.
- **The Draco decoder for three@0.160.0** — `public/draco/` already ships
  `draco_decoder.wasm` + `draco_wasm_wrapper.js`; a page that sets
  `DRACOLoader.setDecoderPath()` can point at `/draco/`.
- **Map tiles** (`basemaps.cartocdn.com` in `azd`) — data, not a library.

## Who points here

`scripts/page-vendor-cdn.mjs` carries the CDN-URL → `/vendor/` map and refuses
production. `scripts/page-vendor-cdn.test.js` asserts every target in that map
exists in this directory, so the map and the files cannot drift apart.
