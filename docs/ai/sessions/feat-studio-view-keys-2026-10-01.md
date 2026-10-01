## 2026-10-01 — Studio view keys (Blender numpad) and frame-selected real extents

**Bug.** `handleFrameSelected` framed `getPointsBoundingSphere` of the entities' origin points, so a large
object (the MOXIR hall: one origin) framed like a point. Now `src/utils/entityBounds.js`
(`entitiesBoundingSphere(entities, getBox)`) unions real world boxes. Bounds come from
`src/studio/utils/entityObjectRegistry.js`: `SelectableEntity` registers its scene group (which carries
position/rotation/scale and the model/primitive children) and `Box3.setFromObject` measures it. No object
(e.g. an empty or light) -> a unit box with `transform.scale` and `rotation` applied. Hidden entities are skipped;
no selection = whole visible room. The fit formula in `cameraFraming.js` is unchanged.

**Keys** (by `event.code`, `src/utils/viewAxisPose.js` `resolveViewKey`): Numpad1/3/7 front/right/top, Ctrl = back/left/bottom
(camera on the axis at the current distance, animated; top/bottom up = -Z/+Z); Numpad4/6/8/2 orbit 15 deg;
Home = view all; Numpad Period = frame selected (the existing `.` and `F` stay). **Numpad5 not done:** the viewport has no
orthographic camera, only the narrow-fov (`fov < 20`) preset hack in `StudioOrbit`; faking ortho on it was refused.

**Without a numpad (WCAG 2.1.1, 2.5.1).** SmartViewBar only offers the six room presets, not axis views, so it was not extended.
Chosen: Shift+1/3/7 (Ctrl+Shift = opposite side), Shift+Arrows orbit, Home. Alt+digit rejected: Chrome and Firefox on
Linux switch tabs with it. Visible control: a `View commands` toolbar above the Navigate/Edit bar in `StudioViewport.jsx`
(Front Back Right Left Top Bottom Frame All), each `aria-label`led with its shortcut, min 44 px, 2 px rectangles
(existing `TOOLBAR_BTN`). Help rows appended to the 'View' section of `studioGuide.js` only.

**Tests.** `entityBounds.test.js`, `viewAxisPose.test.js` (new), 3 cases in `studioKeyboardContract.test.js`
(red on the old editor/guide/viewport, green now). `npx vitest run src/studio src/utils`: 87 files, 807 tests pass.

**Not verified.** Nothing was run in a browser. Owed: a look with a real numpad and on a laptop without one; the
orbit direction of Numpad4/6/8/2 (sign of `rotate()` deltas) against Blender; Ctrl+Numpad may be eaten by the
browser (tab switch) in some browsers, then the buttons / Ctrl+Shift route apply; the button row on a 390 px phone;
the top view's screen-up (relies on camera-controls' spherical azimuth at polar 0).
