## A decoder directory is the one CDN URL worth rewriting inside code

`page-vendor-cdn.mjs` deliberately never touches a URL inside JavaScript — a blind replace
in prose or code is how a page gets quietly broken. One shape earns an exception, and the
azd page is why: it hands three's `DRACOLoader` a decoder DIRECTORY on jsdelivr, so offline
its compressed models never decode and the page sat at "INITIALIZING SPACE... 0%".

`DECODER_MAP` holds that one shape — `…/three@<version>/examples/jsm/libs/draco/` → `/draco/`.
It is a whole constant URL with a single meaning, and the platform already serves
`draco_decoder.wasm` and `draco_wasm_wrapper.js` there (that is how every room in the app
decodes a compressed GLB offline). The two files are added to the `fetches` the `--apply`
guard probes before it writes, so the rule cannot point a page at a decoder the target does
not serve. Rewriting is idempotent, and every other URL in code is still only reported.

Verified: 41 tests in `scripts/page-vendor-cdn.test.js` and `space-sync-vendor.test.js` pass
(three new, one updated — it had pinned the old "setDecoderPath is left alone" contract);
eslint clean. Applied on the local tier and SEEN offline: `/azd` boots and reads (the essay,
the artist names, one canvas) where it used to be stuck at 0%. Its Carto basemap tiles are a
live map and stay unreachable offline — nothing to vendor there.
