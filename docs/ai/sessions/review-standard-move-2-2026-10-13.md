## 2026-10-13 — The standard move, second review: six paths where history still changed a move's speed

Adversarial review of the standard move (useCameraNavigation.js, freeMove.js, useWalkNavigation.js, SmartView's Free branch)
for any path where a move's speed depends on direction, history or the scene. Branched from fix/standard-move-review-2026-10-13.
Every defect below has a case in `src/studio/navigation/standardMove.camera.test.js` ("the standard move, second review": real
camera-controls 2.10.1 through the real hooks) that was run and seen RED before its fix, GREEN after.

### Defects found and fixed (measured in the tests)

1. **Chord zoom**: a middle button pressed mid-turn (Navigate) zoomed with camera-controls' own dolly, which scales with the
   distance: 27.24 m → 7.56 m for 200 px. A chord arrives as a pointermove, never a pointerdown, and StudioViewport's
   `Object.assign(cc.mouseButtons, mouseButtonsFor(...))` effect runs after the hook's (and on every tool switch / ortho
   toggle), putting TRUCK/DOLLY back. Fix: the hook sets every slide/zoom binding aside at each press.
2. **Pinch after a third finger**: lifting one of three fingers kept the old pair's spread and centre; the next 1 px moved
   10.76 m. Fix: the pinch is re-measured when a new pair remains.
3. **Orbit Around Selection mid-glide**: `settleForGesture` before `setOrbitPoint` cut a Shift notch to 2.59 m of 13.62.
   Fix: `settleKeepingGlide` settles, places the pivot, then adds the rest of a translation-only glide back (eased). Also used
   where the focal offset is cleared.
4. **One-finger touch mid-glide**: the touch turn settled first, cutting a 4-step pinch glide to 0.67 m of 10.90. Fix: no
   settle (as the mouse turn since review 1).
5. **Walk at low frame rate**: flyStep's 0.1 s frame cap made Walk at 5 fps cover 1.05 m a second instead of 2.5. Fix: walk
   `maxDt` 0.25 s, the flight's cap.
6. **Automatic speed fixed mid-download**: ModelObject fetches and `parse`s models outside any three loader, so drei's
   useProgress was idle while a hall downloaded and the first gesture fixed the speed from what was already in (a chair:
   0.025 m a notch for the visit). Fix: `reportModelLoad` reports each model to `THREE.DefaultLoadingManager` from start to
   mounted. Side effect, UNVERIFIED in a browser: the V1 editor's drei `<Loader/>` (EditorLayout) now also shows for models.

### Paths checked with no defect

- Wheel in vs out: `moveForward` is a pure translation from the goal pose, symmetric; Shift/Alt from each event's own flags.
- Wheel or slide during a glide, a focus ease or a preset flight: both build on the goal pose, notches add up.
- Slide: metres per pixel from the fixed 10-step distance, never the actual distance; the same right/left/up/down (existing test).
- Zoom drag: symmetric (`zoomDragStep`), same rule as the pinch.
- Flight: forward/back/strafe/up symmetric; near-vertical views keep a strafe axis (camera-controls' `makeSafe` keeps phi ≥ 1e-6).
- Double-click focus then wheel: the step is the speed setting, not the focus distance; any move clears the focus.
- Speed setting: read fresh at each gesture start; the flight reads it at its start.
- Three-finger touch: the Studio's bindings give camera-controls no `touches.three`, so no own truck.
- SmartView Free: removes distance cap, boundary, collision and floor clamp once; a preset's `maxDistance = max(...)` keeps
  Infinity. The Inside → paused-lock → Free sequence can leave `minDistance` at Number.EPSILON, but it only lower-bounds the
  radius and no standard move shrinks the radius below 1 mm: no speed effect (Inside itself is out of scope).

### Open (not changed, owner's call or UNVERIFIED)

- Walk moves at Blender's fixed 2.5 m/s, not the standard speed setting (fly: one step a second). By design in the file's
  header; whether the owner wants Walk to follow the Speed setting is a question for him.
- The automatic speed is kept per three.js scene (WeakMap). Whether switching projects in the Studio's Projects panel keeps the
  same Canvas scene (and so the previous space's speed) is UNVERIFIED.
- Firefox sends a wheel notch as 3 lines (48 px → 0.48 notch) where Chrome sends 100 px: the step differs by browser.
  UNVERIFIED in a real browser.
- Starting Walk mid-glide drops the rest of the glide (Walk takes the camera where it is); an explicit mode change, left as is.

### Validation

- `npx vitest run src/studio src/project/viewport src/objectComponents`: 120 files, 991 tests passed.
- `npx eslint src/studio/navigation src/objectComponents/ModelObject.jsx`: clean.
- Not verified in a real browser (no `verify:surfaces` run): the fixes are proven through camera-controls in jsdom only.
