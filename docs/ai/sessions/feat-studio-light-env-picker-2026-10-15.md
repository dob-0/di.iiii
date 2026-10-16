## 2026-10-15 — Studio: see each version's light environment, Try it, Take it (Sonnet executor, brief studio-light-env-picker)

- Owner 04:4x: "I want to see each and pick what I like; and fully editable in the di.iiii Studio."
- Built: `src/shared/lightEnv.js` (+ test) — groups, `lightEnvOf/Diff/Summary`, `applyLightEnv` (pure), `lightEnvOps`;
  `apply_light_env.mjs` imports it. `src/studio/hooks/useLightEnvPicker.js`; `LightEnvSection` in `StudioShellPanels.jsx`
  (after Views); `StudioShell` draws `lightEnv.previewDocument` in the viewport; `StudioEditor` wires it.
- Tests: `npx vitest run src/shared/lightEnv src/studio/components/LightEnvSection` → 11 pass; `src/shared` 17 files pass.
- Seen on the real GPU (agent lane 2, scratch stack light-env-picker, snapshot copy of moxir-one's data): Try moved the
  picture; Take wrote 0.00027 / 0.6 to the scratch copy and read back; the row's Take went disabled.
- Limit: a Try swaps the document the viewport draws, so a lamp or object edit during a Try shows the tried light too.
- Owed: wiki/screens of the section on a phone width; the 3 estimate-marked versions need the decay test (see the report).
