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
