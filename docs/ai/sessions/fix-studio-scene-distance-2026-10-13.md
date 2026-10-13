## 2026-10-13 — Studio Edit moves take their speed from the scene distance (follow-up to #885)

Follow-up to PR #885, which merged into dev (via #890) with round 9's wheel. This branch carries rounds 10 and 11 of that
work: the owner's "it gets stuck at some objects when I move, then jumps", the cause (Auto Depth in a dense rig), and the
scene-distance mechanism he said yes to. Earlier rounds: docs/ai/sessions/fix-studio-pan-after-zoom-2026-10-12.md.

## Round 10 (2026-10-13): "it gets stuck at objects when I move, then jumps" — the cause is the mechanism, not a number

- **Correction to round 9.** `blender-wheel-probe.py` drove `bpy.ops.view3d.zoom` through its exec path, which skips Auto Depth.
  A real wheel event goes through invoke: `ViewOpsType_zoom` carries `VIEWOPS_FLAG_DEPTH_NAVIGATE | VIEWOPS_FLAG_ZOOM_TO_MOUSE`
  (view3d_navigate_view_zoom.cc:547, v5.0.0), masked by his preferences to DEPTH only. So in his Blender every wheel notch first moves
  the orbit point onto the view axis at the depth of the surface under the pointer (`navigate_pivot_get`, view3d_navigate.cc), then
  scales that distance by 1/1.2. The same flag is on rotate (`ViewOpsType_rotate`) and pan (`ViewOpsType_pan`). The depth is reused
  only inside a "consecutive gesture", which is a trackpad gesture or NDOF, never a mouse wheel (`WM_event_consecutive_gesture_test`,
  wm_event_query.cc:365). Round 9's "the wheel never reads the pointer" was wrong for his preferences.
- Real wheel clicks into his Blender could not be measured: `--enable-event-simulate` events changed nothing, and Blender on the
  agent screen is not reachable by xdotool. The facts above are from the source only.
- **`scripts/nav/probe-stick-jump.cjs`** (MOXIR v1-1, both tools): consecutive moves started at orbit distances 24 → 38 → 24 → 2.7 →
  21 → 10.5 m, because each move takes the depth of whatever is under the pointer when it starts. An Edit orbit after zooming to
  2.7 m re-pivoted to 21.4 m and swept 1.9 m per frame. Navigate wheel notches with the pointer moving across the rig took depths
  36 → 23 → 31 → 29 m, so the step changed 6.1 → 3.8 → 5.2 → 4.9 m from one notch to the next. One Navigate right-drag at 94 m moved
  0.001 m (cause not found yet). 7 of 84 grid picks hit a see-through box (opacity 0.35, depthWrite off) 1.5–5 m in front of what the
  eye sees.
- So the owner's "stuck, then jump" is Auto Depth itself in a dense rig: a lamp 1 m away under the pointer makes the next move crawl,
  the back wall 40 m away makes it fly, and a wheel toward a surface approaches it by 1/1.2 per notch and never passes. Exact Blender
  does the same. The decision on the mechanism is the owner's; asked 2026-10-13.

## Round 11 (2026-10-13): the scene distance, built on the owner's yes

- **Method** (`src/studio/navigation/sceneDistance.js`): McCrae, Mordatch, Glueck & Khan, "Multiscale 3D Navigation", I3D 2009:
  the speed of a move comes from a small depth picture rendered from the camera (64 x 36, a float target, distance per pixel),
  never from the one surface under the pointer. Our choices, written as such and unvalidated against the paper's numbers: the
  statistic is the median of the view's middle third (what you look at), else the whole view's median, else the last distance;
  see-through materials (depth writes off, faded, no colour: the 33 m light-beam cones) are left out, as Blender's depth buffer would;
  the picture's near plane is the controls' contact distance (minDistance 0.35 m), so a surface you are pressed against drops out
  and the wheel goes through it; inside one wheel run (the camera was last moved by this wheel) the distance changes at most 1.2x
  per notch, Blender's step ratio.
- **The Blender tool** (`speedFromView` in mappings.js): the wheel dollies along the view axis by Blender's ratio of the scene
  distance (1/6 in, 1/5 out), camera and orbit point together; orbit, pan and the drag zoom put the orbit point on the view axis at
  the scene distance. The Sketchfab tool is unchanged. Both wheels now stop at the controls' maxDistance (500 m) instead of
  far x 10, which the controls would have pulled back.
- **Two bugs found by looking at the depth picture** (`scripts/nav/probe-depth-picture.cjs`, a map of metres against a direct ray):
  the depth camera drew from the origin (the renderer rebuilds a parentless camera from position and rotation; copying matrixWorld
  was not enough), and the distance was interpolated per vertex, so the 100 m floor read 64 m in every pixel where a ray said 4.8 m.
  After both: 4.93 m against 4.84 m.
- **Measured after** (MOXIR v1-1, RTX 3080 lane):

  | check | before (Auto Depth, round 10) | after |
  |---|---|---|
  | orbit distance, 5 Edit moves in a row (probe-stick-jump) | 24 → 38 → 24 → 2.7 → 21 m | 27 → 32 → 20 → 1.5 → 1.5 m |
  | Edit orbit right after zooming in | re-aimed 2.7 → 21.4 m | stayed 1.55 → 1.54 m |
  | one wheel run, 40 in + 20 out (probe-wheel-run) | — | 0 dead notches, largest notch-to-notch change 1.44x (the in/out turn) |
  | slowest notch, pressed against an object | — | 0.063 m (contact 0.35 m / 6) |
  | seeded stress 60 s, seed 835088540 | — | 0 stuck, camera never under the floor (lowest 0.74 m), 0 navigation errors |
  | one depth picture per notch | — | median 3 ms, p90 9.1 ms, max 40.3 ms (30 notches) |

- The stress's two errors were the light API's 503 on this frontend-only stack, not navigation. One Navigate right-drag that moved
  nothing (1 of 3 runs of probe-stick-jump) did not reproduce with the element under the pointer logged; still unexplained.
- **Owed:** the depth picture is read back synchronously (3 ms median on the event); an asynchronous read
  (`readRenderTargetPixelsAsync`) after each camera change would take it off the wheel. The owner's hands on the Edit tool.
