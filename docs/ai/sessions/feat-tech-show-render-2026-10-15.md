## 2026-10-15 — three renders of one room: Studio, Tech, Show (feat/tech-show-render-2026-10-15)

Owner 06:5x–07:2x (four screenshots): one render for the light show, one for the showcase; "Studio and Tech are not the same".
Decision first: `docs/ai/decisions/2026-10-15-studio-tech-show-render.md` (the field table = `src/shared/renderPlan.test.js`).

- `src/shared/renderPlan.js` — `renderPlan(document, { mode, quality })`: one pure function, render first then quality. The Low
  rule (`outputRenderSettings`, `outputDocument`) moved here; `src/project/viewport/outputMode.js` re-exports it (one copy).
- Tech = render-time copy: atmosphere, bloom, surfaces dropped; shadows off; fog off; ambient white 0.6; `renderSettings.look:
  'schematic'`; entities = rig + building + floor/stage + cameras + their parents; layers machines/outside off.
- Renderer: `atmosphereStore.js` `setSchematic/useSchematic` (per renderer, like the air); `RenderSettingsEffect` sets it and mounts
  `SchematicSurfaces.jsx` (textured meshes → one grey Lambert, restored on unmount); `SpotLightObject.jsx` draws a flat cone
  (normal blending, opacity 0.28, no fade) and a laser as `SchematicLaserLines` (plain lines to the first surface, BeamReachProbe).
- Room page: Display → Tech | Show (`useRenderMode.js`, `?render=`, sessionStorage `di.view.render`), Show default; the scene
  surface remounts on a switch (key). Studio Preview → `?render=show` (`previewUrl.js`).
- Wiki `room-render-studio-tech-show`; vocabulary row **render**.
- OWED: hover info in Tech (name, part, level, DMX address) and an on-screen cue clock; the corner-column layout (no scene bar)
  has no Tech button (the address works); "lamp bodies dark" in Show not changed; GPU look (see the report).
- Report: ~/work/agent-reports-2026-10-15/moxir-50/tech-show-report.md
