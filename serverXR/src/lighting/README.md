# Lighting desk — consuming the bundle (for a node build)

`npm run desk:bundle [-- --out <dir>] [--gz node|python]` writes, to `build/desk-bundle/` by default (gitignored):

- `ui/*` — every file of `serverXR/src/lighting/ui/`, byte for byte (today 7: `index.html app.js style.css qr.js from.js show.js caps.js`; a new UI file is picked up and listed in the manifest).
- `manifest.json` — `{ di_commit, contract_version, gz_producer, files: [{ path, bytes, sha256, gz_bytes, gz_sha256 }] }`. No build time: the same commit gives the same bytes. `di_commit` gets `-dirty` when the UI, `engine.js` or the contract differ from `HEAD`.
- `profiles-node.json` — `{ source: { file, di_commit }, profiles: [{ name, cat, label, channels }] }`: the 13 built-ins a node carries (`dimmer ds drgb drgbs drgbw drgbwa rgb rgba rgbw rgbaw dwwcw ptdrgb ppttdrgbw`), read from `PROFILES` in `engine.js`, never copied.

**What a node checks.** `sha256` of the raw files is the pin: it is identical on every machine. The gzip fields depend on the zlib that made them. Node's bundled zlib deflates differently from Python's (measured: `qr.js` 3106 vs 3101 bytes), and vizzz.di's `tools/fetch_desk_ui.py` gzips with Python (`gzip -9`, mtime 0, no name). `--gz python` makes the gz fields with that same code path, so they match `fetch_desk_ui.py`; `gz_producer` in the manifest names whichever zlib was used. Compare gz hashes only between equal producers.

**Planned, not built here:** `fetch_desk_ui.py --manifest <dir>` in vizzz.di, reading this directory in place of its GitHub fetch. Until then the node keeps pinning with `desk_ui.lock`.

Test: `node serverXR/src/lighting/tests/test-bundle.js` (part of `lighting.test.js`).
