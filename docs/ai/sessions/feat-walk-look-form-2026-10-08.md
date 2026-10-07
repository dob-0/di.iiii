## 2026-10-08 — walk mode takes the Look

Branch feat/walk-look-form-2026-10-08 (from feat/view-look-form-2026-10-08).

Done:
- src/components/LiveProjectScene.jsx: `<FormLight skip={Boolean(worldState.environmentAssetId)} />` in the walk Canvas, as StudioViewport does. Current look draws nothing.
- New shared src/project/viewport/LookControl.jsx (button + Light slider, same markup and titles, 44 px, 2 px radius). PublicProjectViewer (orbit) and the walk chrome both use it; one store (viewLook.js).
- Walk chrome: LookControl top right under the header (offset by topClear), shown while walking when showModeControls is on.
- Tests: LookControl.test.jsx, liveProjectSceneLook.test.js (source guard). vitest on viewport, liveProjectScene*, PublicProjectViewer: 341 passed. eslint: 0 errors (8 pre-existing warnings).

NOT done:
- Not seen in a browser; unit tests only. Placement in walk chrome (top right, 4.5rem under the header) is unchecked on desktop and phone, and against XR/AR overlays.
- FormLight in a real WebGL walk Canvas is untested.
- Not pushed; the owner reviews first.
