## 2026-09-29 — MOXIR as a camera (and an eye) sees the night: beams in haze, exposure, the dark

- Asked: MOXIR "maximum close" to the real night; measured problem on dev: mean luma ≈ 10–12 desktop,
  ≈ 8 phone, thin grey beams, barely any haze, a pale-blue DJ table, a blue-grey room.
- Target written BEFORE the change from 8 Wikimedia Commons photographs (Berlin Atonal/Kraftwerk,
  Tresor, …; links, authors and licences in RIG_BUILD.md §18.1, files only in
  `~/Downloads/moxir-realism/refs/`): mean luma median 21, black share median 0.56.
- Code: beams drawn as single scattering in haze (`beamAir.js`, `beamAirMaterial.js`) when a room carries
  `renderSettings.atmosphere`; a CIE disability-glare veil around each beam; the rig's own return as the
  room's ambient and haze colour (`rigBounce.js`, integrating-sphere relation); AgX/Neutral accepted;
  `atmosphere` + `beam.aperture` in both schemas. Rooms without an atmosphere: unchanged (guard
  `SpotLightObject.air.test.jsx`).
- Bug found and fixed: the arrival view turned an authored 0 ambient/directional back into daylight
  (`||` defaults) — the grey-blue cast. Guard `worldLights.test.js` seen red; known-fixes row.
- Data (LOCAL only, 2026-09-29 19:50:44 +04): `scripts/rigbuild/realism.mjs` on moxir-hall-minimal
  (σs 0.05, g 0.7, ACES × 3.5 = EV100 ≈ 3.6, black night, rigBounce, apertures, night hall). Backup + undo:
  `~/di-backups/preview-rig-builder-2026-09-28/steps/20260929-194513-realism/`. The installed server
  (0.4.16-rigbuilder.9) drops `beam.aperture` and its client ignores the atmosphere until it runs this
  branch.
- Measured (RIG_BUILD.md §18.3): beam cues 18–19 on both viewports (were 8–10), phone = desktop, 60 fps on
  the 3080; misses stated there (red room by construction of luma, blackout target too high, desktop p99,
  strobe needs a high-rate capture, iGPU not measured, the 84 °C gate not reachable — ran at ≤ 95 °C).
- Tools: `scripts/rigbuild/look-probe.mjs` (per-cue luma + fps on the GPU), `look-compare.mjs` (the page).
