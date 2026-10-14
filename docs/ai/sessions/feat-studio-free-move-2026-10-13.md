## 2026-10-13 — The standard move: one constant speed everywhere, nothing in the scene changes a move

The owner, 2026-10-13, after the scene-distance build (PR #892): "we need maximum balanced one ... the same speed and motion
to every side ... free like you can go everywhere ... none of the objects affect the movement"; then "one standard model where
it will be easy to navigate, not connected to the objects around, because when I move it sticks and jumps sometimes, not the
same speed ... settable in settings". Decided with him: everywhere (both Studio tools and the public viewer); turning around a
point a fixed distance ahead, turning in place as a setting.

Method (src/studio/navigation/freeMove.js, useCameraNavigation.js): the camera's speed is a setting, never read from the scene
(Unreal Editor's viewport Camera Speed; Blender's Walk and Fly: one speed, Shift faster, Alt slower; the owner's Blender 5.2.2:
walk 2.5 m/s, speed factor 5). Our choices, written down and settable: automatic speed = the space's largest side / 40, taken
once per visit (MOXIR: 2.5 m a notch); the turning point 10 steps ahead; 100 px of a zoom drag = one step; flying one step a second.

- Wheel: camera and turning point forward or back the same metres every notch, through anything; Shift x5, Alt /5; Chrome's
  sideways Shift+wheel on Linux counts as the wheel. Notches arriving mid-glide add up from the controls' goal pose.
- Slide drag (Navigate right, Edit Shift+middle): the app's own, the same metres per pixel in every direction (the turning point
  follows the pointer). Zoom drag (Navigate middle, Edit Ctrl+middle): the app's own, 100 px a step.
- Turn drag (Navigate left, Edit middle): camera-controls' own turn around a point placed on the view axis at a fixed distance
  (or 1 mm ahead: turning in place). A double-click on a surface turns the view to it and keeps it as the turning point until
  the next move; Blender's Orbit Around Selection, when on, turns around the selection.
- Removed: Auto Depth picks, the scene distance (sceneDistance.js and its probes), dolly-to-cursor, the 1.2x wheel plan; the
  controls' distance range is 0.5 mm to infinity so no clamp bends a move.
- Settings: preference.js gains speed ('auto' or metres) and turning ('point' or 'place'), per device.

Mapped first (read-only agent): only StudioViewport uses this hook (Studio editor, the public viewer's orbit view, rigbuild
PlotRoom). The public viewer's Walk/Fly (LiveProjectScene Walker), Raw, the Studio hub and V1 have their own controls.

### Fly keys, Walk's keys, the public viewer's Free mode (same day)
- Fly: hold the right button over the view, W/S forward/back, A/D sideways, Q/E down/up, one step a second, Shift x5, Alt /5
  (Unity's and Unreal's convention: keys fly only while the button is held, so the Studio's single-key shortcuts stay theirs).
- Walk (Shift+`): every key is the walk's while walking (Blender's Walk is modal); before, E flipped the tool, S picked the
  scale gizmo, A selected all and Shift+D duplicated mid-walk (found by the move-map agent, by reading).
- Public viewer (owner: "the Free/Inside button decides"): Free goes everywhere, through walls and under the floor, with no
  distance cap, boundary or collision (SmartView.jsx); Inside keeps the hall and the camera out of solids as before; default Inside.
- Measured on the RTX 3080 lane (scripts/nav/probe-standard-move.cjs, probe-public-free.cjs, probe-stick-jump.cjs, stress.cjs):

  | check | result |
  |---|---|
  | auto speed (MOXIR v1-1) | 2.724 m a notch (largest side / 40) |
  | one notch / Shift / Alt | 2.724 / 13.619 / 0.545 m |
  | right button + W for 1 s | 2.725 m; E for 0.5 s: 1.363 m up, tool unchanged; W without the button: 0 |
  | turn in place, 200 px | camera moved 0.001 m, view turned 80 deg; around a point: swung 35 m around a point 27.24 m ahead |
  | turning distance over 12 moves in both tools | 27.238 m every time (was 24 → 38 → 24 → 2.7 → 21 m) |
  | E during Walk | tool unchanged |
  | stress 60 s seed 835088540 | 0 stuck, frames over 33 ms 86 of 3861, heap 156 → 166 MB, 0 navigation errors |
  | public Free / Inside, 15 notches down at the floor | Free: under the floor (y -25.0); Inside: stays at y 0.5 |

  The stress's lowest camera was 107 m under the floor: the Studio goes everywhere, as asked. Its 2 errors are the light API's
  503 on a frontend-only stack.
