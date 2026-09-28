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

## 2026-09-28 — the owner: "looks so random … find or create the models of each fixture". Fixtures identified, modelled, posed; designed looks

- IDENTIFIED (manifest `scripts/place/fixtures/fixtures.json`, every number `{value, src, basis}`, accessed 2026-09-28):
  UP-B380F, UP-250BSW, UP-HK1915, UP-PL5403 are **UPlight** (Guangzhou) models — code printed on pro-uplight.com /
  up-light.en.made-in-china.com. UP-LA40WF, UP-Q108S, UP-YH600F, UP-YZ31P are NOT UPlight products (absent from the
  store's 420 listings, the site's 73 products, web search) — modelled on named equivalents (Blue Sea BLLO-RGB40,
  MagicFX CO2 Jet II, Showven Sparkular, Antari Z-1500 III). The rental house must name them — OWED.
- MODELS: GDTF Share needs an account (the owner's hand) and its terms forbid derivatives/commercial use; OFL (MIT) has
  no geometry. So `fixtures/build_fixtures.py` (Blender 5.2, headless) builds each to the datasheet box and the maker's
  photos — Base / Yoke (pan axis) / Head (tilt axis) / Lens nodes, 98–1,034 tris, every axis within 10 % of the
  published size (the sidecar measures it). Licence AGPL-3.0 (the repo's). Compared by eye with the maker photos
  (kept out of the repo): the bee-eye's 19-lens face, the PAR's finned can on its fold-out stand, the B380F's egg
  housing and nose read; they are low-poly, not CAD.
- POSED: `fixture-lib.mjs` (pan/tilt kinematics, hung = upside down, aim solved from the tilt pivot);
  `fixtures-glb.mjs` writes the whole rig's bodies as ONE `EXT_mesh_gpu_instancing` GLB (104 fixtures, 226 KB, 45
  instanced meshes, lens tinted per lamp). Spot lights now start AT the lens and their cones stop at the building
  (`surfaceHit`). Effects are machines, not boxes.
- PHOTOMETRY: no UPlight output figure exists anywhere (0 hits); equivalents' lux@distance → candela → one
  `sceneScale` (0.006) → three.js candela; air brightness I·tan(θ/2), compressed ^1/3. Method in README "Photometry".
- LOOKS (`looks` in the rig file, `rig.mjs --look <name>`): roof-cathedral (default), fan-out, crossfire,
  all-to-centre, curtain. Guards in rig-lib.test.js: nothing refused/clashing/out of travel, every lamp has a mirror
  twin (seen to FAIL on the old index-alternating stage wash, which was asymmetric).
- Fixed on the way: crane PARs alternated girders by index (asymmetric); column beams picked the gable column in the
  entry wall, firing into the door-end crane; cathedral bee-eyes rose into the stage-end crane (lean 55 → 65).
- Backup before writing: `~/di-backups/moxir-before-fixtures-2026-09-28/` (bundle + hall document v989, SHA256SUMS).
- OWED: the rental house's real models for the 4 untraced codes and its datasheets; a fixture component so a hand
  re-aim in the Studio moves the head (bodies are posed at rig.mjs time); DMX modes into the desk; laser MPE / LSO.
- SEEN on the GPU (RTX 3080, ANGLE Vulkan, headed, one browser at a time, renderer string checked), his local tier,
  `~/Downloads/moxir-hall/`: cathedral-v2b-door, cathedral-v2-mid, cathedral-v2-stage, cathedral-v2-close-<kind>-worklight
  (8 kinds; ambient raised IN THE BROWSER ONLY for close-ups, "work light"), crossfire-mid, all-to-centre-b-mid. 60 fps
  on every view (display at 60 Hz = vsync cap; p95 16.8 ms), 59–83 draw calls, 108–119k tris.
- Found by looking: metallic body materials render BLACK with no environment map → bodies are dielectric now.
- OWED: rig-look's camera override is intermittently not applied (3 of ~19 shots showed the space's own camera or an
  aisle view; a second self-navigation of `/moxir` is logged and the measurement retries, the camera is not yet
  fixed); the room reads DARK — 8 real lamps light it, the 42 column PARs are beam-only and their beams are faint by
  datasheet (haze 0.155), so the columns are not washed: a baked column wash or a larger budget is the next choice.
- THERMAL: peer sessions (verify-surfaces on SwiftShader, full vitest in di.iiii-test-cap / di.iiii-land-*) held the
  CPU package at 100 C, load 32, for ~15 min; every browser here waited for < 80 C and still peaked at 95–98 C (the
  cooler). No hall was rendered in software.
