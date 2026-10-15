# Session note — Auto fly (feat/room-auto-fly-2026-10-15)

Owner 2026-10-15 05:5x: "make a cool auto-fly and a button … like an FPV drone … we will show our work."

**Built (all generic, no production name):** `src/project/viewport/autoFly.js` (+ test), `useAutoFlyStop.js` (+ test), SmartView follow
(`fly`, `onFlyEnd`), `useSmartViewState.flying`, SmartViewBar "Auto fly", PublicProjectViewer button + `?fly=1`, StudioViewport hint,
wiki entry `auto-fly`, SMART_VIEW.md section.

**Method:** centripetal Catmull-Rom (Yuksel et al. 2011), coordinated-turn bank (roll = atan(a_lat/g)), speed limited by v ≤ sqrt(a_lat/κ).
**Found on the way:** a route that reverses at the truss, and a U-turn squeezed against the wall, gave radius 0.45 m kinks; fixed by ordering
the waypoints in flying order and starting the lap inside the door. Small rooms (< 10 m) get an oval.
**Owed:** the path is checked against the frame only, not against furniture or steel (a collider raycast along the path); no FOV widening
(FPV lens) yet; Catmull-Rom is C1 — a B-spline would be C2 by construction.
Measured numbers and pictures: ~/Downloads/moxir/v2-11/auto-fly/ (auto-fly.html).
