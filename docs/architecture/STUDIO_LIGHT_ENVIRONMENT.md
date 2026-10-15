# Light environment in the Studio (2026-10-15)

The Scene window has a **Light environment** section: one row per version of the space (every project of the space except a
production's `<production>-versions` list), each with five numbers — haze per metre (marked "estimate" when the physics' own
number is used, `haze.model 'nf-ff'` / `calibrate false`), ambient, exposure, bloom on/off, surfaces on/off.

- **Try** draws the live view with that version's light. Nothing is written: `useLightEnvPicker` hands `StudioShell` a
  `previewDocument`, which replaces the document only for the viewport. A second Try replaces the first; Back restores.
- **Take** writes it to this project: `lightEnvOps(lightEnvDiff(document, applyLightEnv(document, env)))` — one
  `setRenderSettings` and one `setWorldState` merge patch, sent as ONE `applyLocalOps` batch, so the Studio's history holds one
  step and Undo restores it. Disabled when the project already has that light.
- One module, `src/shared/lightEnv.js`, holds the field groups (atmosphere, exposure, bloom, surfaces, fog, ambient) and is
  imported by both the Studio and `scripts/place/apply_light_env.mjs`; there is no second copy.
- Never carried: lamps (`light.intensity/angle`, `beam.length`, `beam.haze`). A beam's length belongs to its own scene's
  surfaces (physics first, 2026-10-13); after a Take that changes the air run `scripts/place/physics_check.py`.
- Source of the method and the numbers: `agent-reports-2026-10-15/moxir-50/light-env-report.md` (§1 table, §4 verdict).
