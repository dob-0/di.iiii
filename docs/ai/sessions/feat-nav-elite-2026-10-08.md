## 2026-10-08 — navigation to Blender parity (wave 2): view keys in the public viewer, on top of the settings, UI levels and fly motion

- Branch merges feat/view-settings-unlimited-zoom-2026-10-08 (View settings, dolly-through zoom, Clip), feat/ui-levels-2026-10-08 (View / Studio levels of the panel) and feat/nav-fly-motion-2026-10-08 (flyMotion.js, not wired), plus this slice: Numpad 1/3/7 (+Ctrl), Numpad 2/4/6/8 orbit steps and Home in the PUBLIC viewer (PublicProjectSceneSurface.jsx; same pure resolveViewKey / runViewCommand as Studio).
- Sources: the two parity audits in agent-reports-2026-10-08 (blender-nav-parity.md: 33 rows; blender-fly-camera-parity.md: 21 rows), built from the Blender 5.2 manual pages fetched on 2026-10-08 (the manual gives no numeric defaults).
- Measured on the real RTX 3080 (di-test-browser): the keys move the camera as Blender's do; Home frames loosely.
- Owed: fly (right button + WASD, Shift/Alt, wheel = speed) wiring, navigation gizmo, Numpad 5 ortho / Auto Perspective, Zoom Region, Alt+MMB, one lens across surfaces, walk mode on the Clip settings; tighter Home; the owner's hands.

## Wave 2 slice 2 — fly mode wired (hold the right button + W A S D)

- `src/studio/navigation/useFlyNavigation.js` drives the pure `flyMotion.js` from the keys; settings group Fly (enable, Fly Speed, Speed Factor Shift). Keys count only while the right button is held, so Studio's letter shortcuts are untouched; the wheel sets the speed while the button is held and the speed outlives a flight.
- Measured on the real RTX 3080, real key events, a fresh page per trial: W with no button 0 m; button + W 1 s 18.9 m; Shift 57.1 m (x3.02); Alt 4.77 m (x0.25); E 18.8 m straight up; A 18.7 m sideways; wheel x4 then W 27.6 m (BEFORE the speed-persistence fix; the re-check is owed in the ledger).
- Bugs found by measuring: the first version read the controls once at mount (null) and attached nothing; the wheel notches before the first key were lost. Both fixed.
- Limits: the right button still pans in the Studio mapping, so moving the mouse while flying slides the view (Unreal's right-button look-around is not replicated); no speed read-out on screen yet; all speeds are ours and unvalidated; not touched by the owner's hands.
