## 2026-09-27 — MOXIR rebuilt as a clean hall model, with the proposed rig hung in it

- The Meshroom mesh of MOXIR was a smeared roof fragment and the venue cannot be revisited, so the
  space's room is now a parametric model: `scripts/place/hall.py` (Blender, headless) builds a Soviet
  single-span crane hall from a structural grid — stepped columns with consoles, runway beams with
  walkways, crane bridges, Warren trusses, lantern, clerestory bands, side aisles, gates — in eight
  meshes by material (~10.7k triangles). Dimensions come from `--dims` files and every value records
  its source, range and confidence in `hall.json`.
- MOXIR's numbers: `scripts/place/rigs/moxir-hall-dims-2026-09-27.json` (VGGT on 55 frames + a
  perspective fit, snapped to GOST 23838-89: 24 m span, 6 m pitch, 15 bays, crane rail 7.6 m disputed,
  truss 11.0/13.6 m, ridge 15.5 m, lantern 12 m) + `moxir-hall-features-2026-09-27.json` (gates, aisles,
  two cranes; sizes GUESSED). Nothing is taped.
- Imported into `moxir` on the owner's local tier through `import.mjs --replace` (new flag: swaps the
  model, drops the old asset reference; `moxir-sources`, the footage wall, untouched). Backup first:
  `~/di-backups/moxir-before-hall-2026-09-27/` (space bundle + the hall document at v510).
- The rig: `scripts/place/rigs/moxir-2026-10-17.json` (fixture classes with class-estimate optics,
  groups, placement rules, budget, night, assumptions) → `rig.mjs` / `rig-lib.mjs` → 90 spot lights +
  stage deck, goalpost truss and 14 effect markers, all `rig-*`, all `animation: static`. Laser rule
  (≥3 m, never descending) and a beam-into-crane check run on every aim; the first fan aim did run the
  stage beams through the crane parked in front of the stage and was re-aimed.
- Platform: `components.beam.only` — the cone without the light (`beamCastsLight` in spotBeam.js,
  SpotLightObject does not mount the SpotLight; both schema mirrors, stored only when true; inspector
  checkbox "Beam only (no light)"; wiki entry). Guards: spotBeam.test.js, schemaSync.test.js,
  rig-lib.test.js.
- Measured (SwiftShader, 1280x800, door view): hall 7.6 fps · 90 beams/0 real 2.5 · 12 real 0.9 ·
  12 real + shadows 0.6 · 90 real 0.1 · 90 real + shadows = every lit material fails to compile
  (MAX_TEXTURE_IMAGE_UNITS 32), the room goes black. So: shadows off past 12 real lamps, and rig.mjs
  reads back — the installed 0.4.16 DROPS `beam.only`, so on the owner's local tier tonight all 90 are
  real lights with shadows off (it warns and switches shadows off itself). The budgeted rig was seen on
  a throwaway stack of this branch (server :4331, vite :5331, scratch DATA_ROOT).
- OWED: a GPU fps number (his Chrome runs on the Intel UHD iGPU; a background tab gives 0 frames); an
  install carrying `beam.only` (then re-run rig.mjs); a taped dimension; the rental house's datasheets;
  the stage position (assumed: far end, in front of the far gate); laser safety sign-off; the Studio
  inspector's new checkbox not looked at on a screen.

## 2026-09-28 — the owner: "too laggy". Fixed on his tier, measured on the GPU

- Cause: the installed 0.4.16 drops `beam.only`, so the first rig on his tier was 90 real spot lights:
  1.0 fps / 1004 ms frames on the RTX 3080 (headed Chromium, ANGLE Vulkan), 283 calls, 126k tris.
- Fix: budget cut to 8 real lamps, shadows off by default; `rig.mjs --beams auto` probes the server and,
  where `beam.only` is dropped, bakes the other 82 beams into one mesh (`beams-glb.mjs`, a named
  workaround — not editable in the Studio). His tier now: 239.7 fps (vsync cap) median 4.2 ms p95 4.3 ms,
  51 calls, 53k tris, door/mid/stage/over; the branch's editable `beam.only` version measured the same.
- SwiftShader runs of the full hall overheated aylmo (CPU 100 °C, load 23) — `rig-look.mjs` now refuses
  software rendering, runs one browser per view, waits for the CPU to cool. Headed Chromium reached the
  NVIDIA card only with ANGLE on Vulkan + PRIME variables for GL, EGL and Vulkan.
- Seen, not fixed: on a phone-shaped viewport the opening shot faces an end wall, not down the nave, and
  the site's top bar overflows at 390 px. No real phone measured.
