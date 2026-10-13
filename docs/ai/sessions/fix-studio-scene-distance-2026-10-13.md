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

## Round 12 (2026-10-13): four agents in parallel; the review's fixes and the dead pan, measured

The owner asked for multi-agent work. Four agents ran beside each other (reports in ~/work/agent-reports-2026-10-13/studio-nav/):
review-892 (Opus, 12 findings), dead-pan (Opus), scene-async (Sonnet), sketchfab (Sonnet).

- **Depth picture from the scene's own materials** (review F4-F6): drawn into a target with a DepthTexture, a second pass turns depth
  into metres, as Blender reads its viewport depth buffer. The Smart View's cut planes and near fade, back faces, cut-outs and
  see-through glass slots count as the eye sees them. Floor case against a direct ray: 4.89 m vs 4.84 m.
- **Wheel runs speed up again after a surface** (F1): a run keeps the distance each notch USED; keeping d/1.2 cancelled the allowance
  and the run crawled at 0.07 m per notch with 30 m behind the wall. The limit is 1.2 per notch of scroll, 1.2^|n| per event (F2).
  The Blender tool writes a pending pose with `cc.update(0)` before reading the camera (F3). The centre decides only when at least
  half of it shows something (F7). F8-F11 hardening (one depth camera per page, cube face/mip/info restored, hide inside the try,
  half-float fallback with a one-time warning, a notch out stops at the controls' range). A drag's picture starts at the camera's
  own near plane, the wheel's at the contact distance (F12).
- **The dead Navigate pan was a click** (dead-pan agent): an orbit's left release selected the object under the pointer (r3f sends
  onClick on a drag release), the Inspector opened over the canvas and the next pan pressed a panel button. The entity onClick now
  skips drags (`e.delta > 2`), as the group handler below it did. Replay, 10 runs per arm: orbit then pan 10/10 dead before, 0/10
  after; a plain click still selects 10/10.
- **Measured after** (MOXIR v1-1, RTX 3080 lane, CPU 86-91 °C, two other sessions linting):

  | check | before (round 11) | after |
  |---|---|---|
  | wheel run 40 in + 20 out | 0 dead, worst 1.44x | 0 dead, worst 1.2x |
  | depth picture per notch, median / p90 / max | 3 / 9.1 / 40.3 ms | 7.1 / 13.7 / 47 ms |
  | stress 60 s seed 835088540: stuck, dead notches, errors | 0, 0, 0 | 0, 0, 0 |
  | stress frames over 33 ms | 93 of 3826 | 206 of 3808 |
  | stress lowest camera | 0.74 m | -3.03 m (under the floor) |

  The cost doubled because the real materials shade (MOXIR has 96 spot lamps); the heat inflates every number in this table and a
  quiet-machine rerun is owed. Under the floor: the wheel passes any surface it touches and now speeds up behind it, and the floor
  is a surface; round 11's runs crawled there instead. Whether the floor should stop the wheel is the owner's call (asked).
- **scene-async** (branch feat/scene-distance-async-2026-10-13, NOT merged): reading the picture asynchronously served 58 of 60
  notches from a picture taken at the exact pose and cut the wheel handler from a median 9.5 ms to 1.0 ms, but the ~7 ms of drawing
  moved into the frame, so motion is not smoother. The cost is the draw, not the read. It also found that three leaves
  PIXEL_PACK_BUFFER bound while an async read waits, which breaks any ordinary readPixels (INVALID_OPERATION 1282).
- **sketchfab**: Sketchfab never rendered in the lanes (lane 1 refuses its 'high-performance' contexts; lane 2's GPU process
  crashed twice, crash count 2, do not load Sketchfab there). Its published controls differ from our Navigate in the middle button
  (pan there, zoom here), Shift/Ctrl + left drag, and a double-click on the background (recentre there).
