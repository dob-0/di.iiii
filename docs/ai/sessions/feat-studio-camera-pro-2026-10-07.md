## 2026-10-07 — Studio camera: zoom out, move around, lens, speeds

Owner: "when I work in Studio it's too hard to zoom out and move around the objects, not the selected one, when you want to work fast and focus on some objects … also FOV and other settings so we can fully use Studio."

**Method.** Reproduced by hand on a copy of the MOXIR space (scratch di-dev tree, hall + rig, 125 things), headed Chromium on the RTX 3080 (ANGLE/Vulkan), wheel notch = deltaY 100, 1700x950. Not claimed from reading code.

**Measured before (dev, `dollySpeed` 1, far 400 from the project's saved view, `maxDistance` 500):**
- 1 wheel notch = x1.29 of the distance; 10 notches = x13.8 (17 m -> 240 m). Three notches of deltaY 200 took 17 m -> 81 m.
- Past about 15 notches the camera sat beyond the far plane and the **whole room went black** (nothing in the frustum) — the "I zoom out and lose everything".
- Zoom-out ran along the starting ray (camera below the target in the saved view), so the camera ended **under the floor**, 98 m below it, looking at the underside of the hall.
- Zoom toward a pointer that hit nothing carried the orbit point away: ten notches out put it 3,391 m from a 120 m hall.
- Orbit 300 px = 114 degrees (0.38 deg/px); pan scaled with distance (fine).
- No lens control at all; speeds fixed. A project with a fixed opening shot (MOXIR) ignores the pane's camera, so a lens set in the pane did nothing until it had its own prop.

**Changed (`src/studio/navigation/*`, `CameraPanel.jsx`, `StudioViewport.jsx`):**
- `cameraSettings.js` (per device, localStorage `di.studio.camera`): zoom / orbit / pan speed (0.2-3x), `pointerPivot` (on), `keepAboveFloor` (on). Zoom baseline 0.6 -> x1.17 per notch, x4.6 for ten.
- Clip planes follow the distance every frame (`clipPlanesFor`: near = d/500 within 0.02-2 m, far = max(400, 3d+300) up to 20 km). Never lowers an authored far.
- `keepAboveFloor`: the polar limit that keeps the camera at y >= 0.15 for the current distance (`maxPolarAboveFloor`), applied every frame, so zooming out glides up instead of through the floor.
- Orbit point bounded to the content's box + half its size (>= 30 m), re-measured every 2 s (`contentBoundary`).
- Orbit/zoom about the surface under the pointer in the Studio preset too (it was Blender-preset only), the setting `pointerPivot`.
- `infinityDolly` (owner's 09-02 stuck-at-max-zoom fix, branch `fix/orbit-infinity-dolly`) — one line, adopted; `minDistance` 0.05, `maxDistance` 800.
- Camera panel (button bottom-left, shows the lens): field of view 22-110 degrees with 15 / 24 / 35 / 50 mm buttons (full-frame 36x24 mm, vertical angle, fov = 2 atan(12/mm)), the three speeds, the two switches, Frame all, Frame selected. The lens belongs to the view: it is saved by "save view", not by the device setting.
- F with nothing selected and the pointer over a thing flies to it (`focus.js`: small thing framed whole, big thing = move in on the clicked spot). Double-click is NOT used — it opens Quick Insert.

**Measured after (same copy, same input):** 20 notches out stays in the room (target held inside the content box), camera y >= 0.1 at every distance, the hall stays in view at 20 and 50 notches, lens button 35 mm -> fov 37.9 degrees with the camera position unchanged, clicking to select moves no camera, wheel over a window moves no camera, 60 fps idle and while zooming (RTX 3080). 61 navigation tests + 433 Studio tests pass.

**Not done / owed:**
- Seen only by me on the test copy: the owner has not looked at it yet.
- Not tried on touch hardware; touch gestures are unchanged, the panel is 320 px max and shrinks to the viewport.
- Frame all on MOXIR stands 272 m back (the bounding sphere is large); a tighter fit for tall/long rooms is a separate design choice.
- Pre-existing, not touched: React warns `<button> cannot appear as a descendant of <button>` in the Objects list (`StudioShellPanels.jsx` StructureRow).
- Arrow/WASD fly mode and saved camera bookmarks beyond "save view" are not built.
