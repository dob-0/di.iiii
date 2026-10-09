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

## Mechanics invariants (2026-10-09): where the movement really broke, measured, and the Inside fix

- The owner asked for Blender's MECHANICS, not only its keys. "Blender mechanics" made into numbers a test can check (dev-only probe `window.__diNavProbe` in StudioViewport.jsx + harness): (1) PAN LOCK: the surface point grabbed by the pointer stays under it; (2) ZOOM-TO-CURSOR LOCK: the point under the cursor stays under it; (3) ORBIT: distance to the pivot and horizon unchanged; (4) ZOOM STEP: a constant ratio per wheel notch.
- Measured on the RTX 3080 (real mouse events). Free and the Blender mapping already held: pan error 1.3 px, orbit distance 94.89 -> 94.89, roll 0 deg, zoom ratio 0.815 per notch (constant). INSIDE (the default for visitors) did NOT: pan error 431.6 px, zoom drift 2,191 px, first zoom notch x4.7, later ratios 0.882..0.910 (not constant). Cause: Auto Depth picked a wall 50 m away, camera-controls clamped that pivot into the interior target box and dragged the camera with it.
- Fix `limitPivot` (useCameraNavigation.js): the pivot never farther than 90 % of maxDistance along the ray and inside the target boundary. After (Inside): pan error 127 px (the grabbed wall is beyond the allowed pivot, so it cannot lock; no yank), zoom drift 37 px, zoom ratio constant 0.814-0.815.
- Not fixed on purpose: Inside collision still shortens the orbit distance (9.9 -> 6.14 m): it is the product's "keep the camera in the building" behaviour, not Blender's. Orbit sensitivity: camera-controls turns 360 deg per window HEIGHT dragged at speed 1; Blender's own per-pixel value is not in the manual (slider exists).
- No new controller was built: the measurements show the existing mechanics hold the invariants outside Inside; a rewrite would add risk for no measured gain.
- 2026-10-09 nav batch A: walk diagonal/dt/blur, fly latch/wheel/rescale/controlend/modifiers/stopImmediate, Studio FOV damping, AutoLookAround surrender; helpers in navMath.js; spec updated.
