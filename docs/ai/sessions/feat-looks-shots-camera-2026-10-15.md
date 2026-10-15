# feat/looks-shots-camera-2026-10-15 — the plan's camera moves the room page's view (2026-10-15)

## Status: fixed and proven (dev build)

The room page (`PublicGraphSurface` → `RawViewport`, OrbitControls) ignored the document's `fixedCamera`, so a shot plan's `camera` never moved the view.
Fix: `RawViewport.jsx` mounts a dev-only `DevViewHandle` (`window.__diView = { camera, setView }`, only when `import.meta.env.DEV`);
`scripts/measure/light-env-shots.cjs` calls `setView(plan.camera)` after the page settles and records the read-back position in `shots.json`.
Proof: moxir-v2-11 green-breath, camera null vs `[-8, 1.7, -32.338]` fov 40 — read back `[-8, 1.7, -32.34]`, fov 40, the two pictures differ (RTX 3080, lane 1).
Not tested: a production build (the handle is absent there by design); Studio and the Inside/SmartView page (other cameras, not used by the plans).
Why not `window.__diRoom`/SmartView: `__diRoom` exists only with bloom, SmartView only with Inside; neither was mounted on this page.
