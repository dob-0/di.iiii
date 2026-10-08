## 2026-10-08 — navigation to Blender parity (wave 2): view keys in the public viewer, on top of the settings, UI levels and fly motion

- Branch merges feat/view-settings-unlimited-zoom-2026-10-08 (View settings, dolly-through zoom, Clip), feat/ui-levels-2026-10-08 (View / Studio levels of the panel) and feat/nav-fly-motion-2026-10-08 (flyMotion.js, not wired), plus this slice: Numpad 1/3/7 (+Ctrl), Numpad 2/4/6/8 orbit steps and Home in the PUBLIC viewer (PublicProjectSceneSurface.jsx; same pure resolveViewKey / runViewCommand as Studio).
- Sources: the two parity audits in agent-reports-2026-10-08 (blender-nav-parity.md: 33 rows; blender-fly-camera-parity.md: 21 rows), built from the Blender 5.2 manual pages fetched on 2026-10-08 (the manual gives no numeric defaults).
- Measured on the real RTX 3080 (di-test-browser): the keys move the camera as Blender's do; Home frames loosely.
- Owed: fly (right button + WASD, Shift/Alt, wheel = speed) wiring, navigation gizmo, Numpad 5 ortho / Auto Perspective, Zoom Region, Alt+MMB, one lens across surfaces, walk mode on the Clip settings; tighter Home; the owner's hands.
