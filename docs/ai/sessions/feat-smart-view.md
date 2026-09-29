## 2026-09-29 — smart view: a building stays in sight from anywhere (occlusion fade, cutaway from outside, six view presets, x-ray, camera limits)

- The owner on MOXIR: "when i move the mouse i go out from the building and nothing visible
  … when something front it will be transparent … i need and want smart view methods". A
  platform feature for every room with a building in it: `src/project/viewport/smartView/`,
  mounted by `StudioViewport` for the published room (orbit) and the Studio viewport panes.
  Method, sources and limits: `docs/architecture/SMART_VIEW.md`.
- Occlusion fade: 5-ray BVH raycast (three-mesh-bvh, now a direct dependency) at 15 Hz decides;
  the building's fragments in front of the target inside a screen circle are screen-door
  dithered (Bayer 4×4, up to 85 %). Cutaway: six shared clip planes (roof, four walls, a
  preset's section); the authored fog stands back by the camera's distance outside. Presets
  on keys 1–6 and a row (Floor, DJ, Top, Side, Rig, Crane) computed from the room and rig,
  overridable by `presentationState.viewPresets`; `#view-<id>` deep links. X-ray on Alt+Z.
  Visitor camera limits through camera-controls (maxPolarAngle for the floor, maxDistance,
  setBoundary for the target).
- The building is found through what the place pipeline writes (`place-hall`, `venuePlan`
  outline, `hall.py` mesh names) with a bounds fallback; the rig is never touched.
- Studio: same views and x-ray at the top of each pane, keys act on the pane under the
  pointer, a digit a cue claims stays the cue's; no camera limits there.
- Not done / owed: the visualiser split (#644) needs `&views=1` on its room frame for the
  row; the fade circle is a fixed share of the screen; clicks still hit cut-away parts;
  no MOXIR document carries authored `viewPresets` yet (owner's call); the realism PR #660
  (atmosphere/beams) was not on dev — its haze needs a look together with the fog offset.

### Measured (2026-09-30, one sitting, before = origin/dev 37ca97b2, after = this branch)

MOXIR `moxir-hall-minimal` on a scratch copy, RTX 3080 (ANGLE on Vulkan, PRIME offload),
uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`), 4 s per sample. CPU package
96–100 °C throughout (85 °C was not reachable: other sessions' jobs hold the cores), so the
numbers carry a thermal error of the order of ±15 %.

| view | before fps | after fps |
|---|---|---|
| desktop 1440×900 DPR 2, opening shot | 140.7 | 100.4 |
| desktop, a column in the way | 145.6 | 124.3 |
| desktop, pulled far outside | 3602 (black screen) | 614 (hall cut open) |
| desktop, Floor / Crane | — | 111.2 / 112.6 |
| desktop, x-ray Crane / x-ray Top | — | 167.1 / 341.1 |
| phone 390×844 DPR 3 (emulated), opening | 500.8 | 355.7 |
| phone, Crane / x-ray Crane | — | 643.8 / 662.0 |

- X-ray at the crane view was 42.8 fps before this round (the roof, a 41k-triangle space
  frame, ghosted over the whole screen). Now the roof is not drawn in x-ray and edges are
  made only for meshes ≤ 12 000 triangles: 167 fps.
- The opening shot costs ~30 % (140 → 100 fps): the dither/clip shader on the building's
  materials plus the 15 Hz raycast. Still above the 60 fps bar; not profiled further.
- Floor view no longer grey (target heights now follow the hung lamps; the camera stood in
  a beam cone). Side stands ~12–18 m out instead of 83 m.
- Frames + compare page: `~/Downloads/moxir-smart-view/index.html`.
- Tests: 5 failures in `sdk/door.test.js`, `sdk/sdk.test.js`, `scripts/di/openFile.test.js`,
  `src/kit/kitCatalogue.test.js` fail the same on untouched origin/dev in this machine's
  shared node_modules (version strings) — environmental, not this branch.
- Owed: from far outside the hall reads small and dark (the cut works, but the rig is a few
  pixels at maxDistance); a real phone (S24) has not been tried; seen on the scratch stack,
  not yet at https://local.thedi.studio/moxir (that runs the installed release).
