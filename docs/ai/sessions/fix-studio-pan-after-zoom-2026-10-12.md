## 2026-10-12 — the Studio is stuck after a wheel zoom into open air (owner, ledger N511)

## 2026-10-12 measure: does the Auto Depth fix (2e20d44e) remove "zoom in, then right-drag is stuck" in the Studio editor?

Result: NO, not in the case that reproduces the bug. Before (installed di 0.4.4-dev.0dc90bf2, studio preset autoDepth false) and after
(navfix Vite tree, autoDepth true, read from the live module) give identical numbers to 3 decimals in every scenario that ran.

Method: real mouse events (CDP) on the RTX 3080, di-test-browser, lane 1/2, canvas 1600x900, pointer at canvas centre, wheel notch deltaY -100
every 150 ms, settle 600 ms, right-drag 240 px / 300 ms / 20 steps, camera read every rAF from camera-controls (found by walking the React fibre
tree, no app hook, so it works on the production build). Script: scripts/nav/measure-pan-after-zoom.cjs (NAV_URL, NAV_NOTCHES, NAV_AT, NAV_SHOT).
URL: /moxir/studio/projects/moxir-v1-1 (MOXIR v1.1, 147 objects, real hall; the Studio editor opened with no sign-in). Hall about 100 m long (10-08 note).
Camera start (-5.2, 1.6, 20), orbit distance 24.2 m.

| scenario | build | zoom m (total) | zoom m/notch | max zoom frame jump m | orbit dist after zoom m | pan m / 240 px | max pan frame jump m |
|---|---|---|---|---|---|---|---|
| 12 notches, centre | before | 21.07 | 1.76 | 3.80 | 3.11 | 0.996 | 0.050 |
| 12 notches, centre | after  | 21.07 | 1.76 | 3.80 | 3.11 | 0.996 | 0.050 |
| 25 notches, centre | before | 23.84 | 0.95 | 3.80 | 0.399 | 0.128 | 0.006 |
| 25 notches, centre | after  | 23.84 | 0.95 | 3.80 | 0.399 | 0.128 | 0.006 |

Reading: 12 notches leave the orbit point 3.1 m away, so a 240 px drag pans 1.0 m: proportionate, not stuck. 25 notches leave it at 0.399 m (the
0.35 m minDistance plus infinityDolly), and the same drag pans 0.128 m: this is the owner's "stuck", and the fix does not change it.
Pan distance is about 0.32 x orbit distance in both. So the Auto Depth fix helps only when the pivot sits in open air at a distance the surface under
the pointer would change; here the pointer is over geometry or the pivot is already on it, and nothing moves.

Not measured / limits: (1) an extra run, 12 notches at pointer (0.5, 0.8), started from a different camera (orbit 6.7 m, the editor does not always open
at the same view) so it is not comparable; its after value was pan 0.117 m at orbit 0.369 m, before value was the 12-notch row above. (2) pointer (0.7, 0.25)
was over a floating panel: no zoom in either build, invalid. (3) Not the owner's hands or mouse; Chromium on the agent screen, one run per cell
(the 12-notch centre row repeated 4x for after, 2x for before, identical). (4) No hall bounding box read; 100 m is from the 10-08 note.
(5) Screenshots after the drag: scratchpad before.png / after.png / before-n25.png / after-n25.png.
Owed: the real fix for the 25-notch case, e.g. scale pan speed from the distance to the surface under the pointer rather than the clamped orbit
distance, or stop infinityDolly pulling the pivot to the 0.35 m clamp; then re-measure with this script (expected: pan m / 240 px grows from 0.128).

## The cause, and the fix measured (same session, after the table above)

- The dev-only trace (`window.__diNavTrace`, `NAV_TRACE=1`) showed the pan handler firing with 147 entity roots and the pointer
  ray hitting NOTHING: at the hall's centre the pointer sits on fog / the open length of the hall. Blender's Auto Depth has no
  answer for a miss (it keeps the previous depth); here the previous depth is camera-controls' 0.35 m clamp, dragged along by
  `infinityDolly` while zooming into air, so every pan and wheel step was scaled by 0.35–0.4 m. `scripts/nav/probe-pick.cjs`
  cast rays from the stuck camera along six world axes: floor 4.46 m down, roof 8.89 m up, wall 3.68 m behind, nothing ahead
  or to the sides (even with every material double-sided). So the miss is geometric, not a raycast fault.
- Fix (`autoDepth.js fallbackPivot`, used by `useCameraNavigation.js` for PAN and DOLLY): when the pointer ray misses and the
  orbit point is already closer than the nearest surface around the camera, the pivot is placed that nearest-surface distance
  along the view ray. Our rule, written down as such; while the orbit point is farther than that surface, Blender's rule holds
  (depth unchanged) so the approach down a hall is as fast as before.
- Measured AFTER (MOXIR v1.1 Studio, real mouse on the RTX 3080, 240 px right-drag after N wheel notches at the canvas centre):

| case | pan before | pan after | orbit distance before → after | last wheel notch before → after | max pan frame jump after |
|---|---|---|---|---|---|
| 25 notches | 0.128 m | 1.644 m | 0.399 m → 5.13 m | 0.063 m → 0.79 m | 0.082 m |
| 12 notches | 0.996 m | 1.111 m | 3.11 m → 3.47 m | 0.579 m → 0.64 m | 0.056 m |

  The first notches are identical before and after (3.80, 3.20, 2.70 m). Zoom-in total over 25 notches: 23.8 m → 29.4 m
  (it keeps moving instead of dying at 6 cm). A first version that used the fallback whenever the ray missed slowed the approach
  to 0.29 m per notch from the start (7.2 m in 25 notches) and was dropped.
- Not seen by the owner's hands yet. Rerun: `NAV_TRACE=1 NAV_NOTCHES=25 NAV_URL=<studio url> di-test-browser run scripts/nav/measure-pan-after-zoom.cjs`.

## Owner's hands, round 1 (2026-10-12, moxir-test): "when I look forward and want to go down it is slow"

- Measured first: a down drag and a sideways drag move the SAME (1.113 m per 240 px after 12 notches, both axes), so
  "slow" is the whole grab in fog, not the direction. The nearest-surface rule alone picks the floor 3.5–4.5 m below
  the camera: the most cautious depth in a 100 m hall.
- Rule now (`resolveMissDepth`): on a miss, keep the depth the view last had from a real surface or a framing (Blender's
  "previous depth"), never the 0.35 m clamp; a larger view distance (framing, zoom-out) is adopted, a smaller one may be
  the clamp and is not; the nearest surface stays the floor of the answer. 5 unit tests.
- Measured (12 notches at the centre, then 240 px right-drag): pan 1.113 → 7.747 m; every wheel notch 3.8 m (constant,
  the framing depth of 24 m re-placed ahead at each quiet burst; before: decaying to 0.58 m by the 12th notch);
  zoom total 21.1 → 43.8 m; max pan frame jump 0.387 m. Pointer on a surface keeps the exact grab (hit sets the depth).
- Not measured: the 25-notch run timed out waiting for a test-browser lane (a peer was using lane 2); the 12-notch run
  shows the rule. Owner's hands next.

## Owner's hands, round 2: "when I zoom and try to move it does not move … why change the numbers, we need to write logic"

- Owner's rule, written to `~/.claude/CLAUDE.md` the same hour: only what he asked; if impossible or in need of a conversation, talk
  first. What he asked (twice): right-drag moves in the world by the same step at any zoom, a default, and a place in the Studio
  to set your own.
- Built (`worldMove.js`, `useCameraNavigation.js`, `mappings.js`, `preference.js`, `NavigationPreferenceControl.jsx`): right drag
  in the Studio preset is the app's gesture, not camera-controls' pan: camera and orbit point move together by `step / 100 px`
  with `cc.truck(x, y)`; no distance in the formula. Step = the owner's value (Shortcuts tab, "Move step", metres per 100 px,
  stored under `di.studio.navigation.moveStep`) or auto = the scene's largest side / 40. Orbit, wheel and touch unchanged.
  19 new/updated unit tests (60 in the navigation suite + preference control + help dialog).
- Measured (MOXIR v1.1 Studio, real mouse, RTX 3080, 240 px right-drag): 0 notches 7.889 m · 12 notches 7.889 m · 25 notches
  7.889 m (auto step 3.287 m per 100 px; before this round: 7.747 / 1.113 / 0.128 m depending on the zoom). Max frame jump
  0.394 m (20 steps over 300 ms).
- Left on the branch from the earlier rounds and NOT asked for by the owner: the wheel's miss rules (nearest surface, remembered
  depth). Raised with him as a question, not decided here.
- Sterile: the measurement scripts close their page on error too; no stray pages after the runs; the `navfix` stack stays up
  as `studio-nav-test.diiii.localhost` while the owner tests (ledger N511.4), then `di-dev down navfix`.

## Owner's hands, round 3: "open my Blender, look to the settings, make it like Blender" → "view like sketchfab, edit like blender"

- His Blender (5.2.2 LTS, `~/.config/blender/5.2`, stock "Blender" keymap), read with `blender -b --python`: turntable, Orbit
  Sensitivity 0.4°/px, Auto Depth ON, Auto Perspective ON, Zoom to Mouse Position OFF, Orbit Around Selection OFF, zoom
  method Dolly/vertical, no inversions, Emulate 3 Button OFF, Walk mode (2.5 m/s, Shift ×5, eye 1.6 m, no gravity), Smooth
  View 200 ms. Dump: `/tmp/…/scratchpad/blender-prefs.json` (session-only).
- Decision (his, in words): the TOOL picks the mouse. **Navigate and the public viewer = Sketchfab** (drag orbit, right-drag
  pan, wheel zoom toward the pointer, double-click focuses on the surface). **Edit = exactly Blender** (middle orbit, Shift+middle
  pan, Ctrl+middle zoom, wheel zoom not to the pointer, left selects), "people will not need to learn something new".
  Unlimited scroll stays ("look to browser you can unlimited scroll"). The fixed-step right-drag move (round 2) is removed:
  it is in neither.
- Built: `StudioViewport` picks the preset from `editMode`; Blender's 0.4°/px via `azimuthRotateSpeed = height/900`;
  `blender.dollyToCursor=false`; `studio.focusOnDoubleClick` (orbit point to the surface under the pointer); the browser's
  context menu is suppressed over the viewport in both; the Shortcuts tab shows both mouse tables and no radio (the
  NavigationPreferenceControl and the moveStep preference are gone; `preference.js` keeps orbitSelection).
- Measured (real mouse, RTX 3080, MOXIR v1.1): Navigate right-drag after 25 notches into fog 7.747 m per 240 px (orbit point
  0.399 → 24.2 m by the previous-depth rule); Edit Shift+middle pan after 12 notches 7.747 m; Edit middle drag 240 px = 35.67 m
  chord on a 24.2 m circle = 96° = 0.4°/px (Blender's); context menu suppressed in both tools.
- Owed, next PR: Auto Perspective (his ON), Walk mode Shift+` with his numbers, the help dialog's rows for Edit's numpad keys.

## Round 4: "not smooth" → "scroll the link you opened, it is stuck" — the deep audit (owner: "read every possible thing")

- Research (Sonnet, web + camera-controls 2.10.1 source): `docs/ai/research/smooth-navigation-2026-10-12.md`. Blender's own source
  (`view3d_navigate_view_zoom.cc`, main, fetched): a wheel step is `step = 1.2f` applied at once, no Smooth View; drags write the
  view per mouse move; Zoom to Mouse Position only with `use_cursor_init`. So Edit's instant wheel step already matched Blender.
- My own probe was wrong for a round: camera-controls `getPosition()` returns the END pose by default (receiveEndValue=true);
  the probe now logs `cc._camera.position`. With that: dev = 1 frame per notch (3.8 m jump), branch Navigate with
  draggingSmoothTime 0.125 = 15.7 frames per notch, max frame step 0.385 m.
- Easing is now per tool (`mappings.js`): Navigate smoothTime 0.25 / draggingSmoothTime 0.125 (camera-controls defaults, a glide;
  Sketchfab publishes no numbers — stated as such); Edit 0.2 / 0 (Blender: instant drags and wheel; his Smooth View 200 ms for
  view changes).
- His tab, read-only sampler during his own test (eDP-2 2560×1440 @ 240 Hz, DPR 1.5, di browser --ozone-platform=x11
  --use-angle=vulkan on the 3080): rAF median 8.3 ms (120 fps) in every active second, p90 8.4–16.6 ms, worst frames 37, 54
  and 29 ms in the first three seconds (warm-up), none over 20 ms afterwards. Frame rate is not the stuck.
- His pivot trace from that test: 25 wheel notches with the pointer on the roof at `distance 0.35` (camera-controls' minDistance
  clamp), 4 cm per notch. Reproduced (`NAV_POINTER=surface`, 40 notches): before, the last notches 0.053 m each at 0.35 m;
  after `pickPivot({ beyond: minDistance × 1.5 })` (a surface closer than the clamp is the one we are pressed against, look
  past it): 5.7–7.2 m per notch, 150.5 m of travel, the camera goes through. Pan after: 7.746 → 17.244 m per 240 px.
- Owed: the owner's hands on Navigate's glide vs Edit's instant feel; a drag at 120 fps with DPR 1.5 on a 2560×1440 panel is
  the heaviest case — the render cost per frame on his GPU was not measured (only rAF gaps).

## Round 5: "can we make that will have full freedom to move" → Blender's Walk in the Studio

- `useWalkNavigation.js` (modal, both tools): Shift+` enters (Blender's key), pointer lock, mouse looks at 0.4°/px (his Orbit
  Sensitivity; Blender's own walk factor is not published — stated), W/S along the look, A/D strafe, Q/E world up/down, Shift ×5
  (his walk_speed_factor), Alt ×0.25 (ours), 2.5 m/s (his walk_speed), no gravity (his). Esc / Enter / left click keep the place,
  right click returns to the start (Blender's cancel). camera-controls is paused while walking and re-aimed from the new place with
  the look depth kept, so orbit continues. Frames are held while walking (renderDemand). Motion = the 10-08 pure `flyMotion.js`
  (ported with its 12 tests) with a short ramp.
- Measured (`scripts/nav/measure-walk.cjs`, real keys, RTX 3080): pointer lock on; W for 1 s = 2.451 m (2.5 m/s minus the ramp);
  Shift+W for 1 s = 12.253 m; 200 px of mouse turned the look to (0.98, 0.12, −0.17); after Esc camera-controls enabled again, target
  24 m ahead. 7 new unit tests (68 in the navigation suites).
- Owner's words that led here: "not smooth", "stuck", "full freedom to move omg", and "look deeper: OpenGL / WebGL / GLSL" — the
  rendering audit runs as a separate report (`docs/ai/research/render-smoothness-audit-2026-10-12.md`).

## Round 6: the rendering side ("look deeper: OpenGL / WebGL / GLSL") — audit + the measured fixes

- Audit (Opus, real GPU, his screen size 1707×960 CSS @ DPR 1.5): `docs/ai/research/render-smoothness-audit-2026-10-12.md`,
  probe `scripts/nav/measure-render.cjs`. Per frame at full screen: GPU 9.74 ms of which the 96 spot lamps 7.3 ms (48 hidden →
  5.34 ms; all off → 2.46 ms), beams 0.9–1.3 ms, bloom / SMAA / shadow draw ≤ 0.4 ms each; CPU 4.7–5.3 ms (240 Hz needs < 4.17 ms →
  his 120 fps); the 12 spot shadow maps redrawn every frame (637 draw calls, 833 k triangles); after ~4 s idle the GPU clock sits at
  225 MHz and the first frames of a drag took 52–144 ms (his worst frame 54 ms); a look fade's 30 Hz clock keeps re-rendering.
- Fix 1 — `ShadowsOnDemand` (RenderSettingsEffect.jsx): `shadowMap.autoUpdate=false`, redrawn on a document change, when a
  casting/receiving mesh arrives or leaves, during a gizmo drag or any hold (timeline, XR, walk). Measured while moving: draw calls
  637 → 342–403, triangles 833 k → 145–151 k, CPU render 4.7 → 3.8–4.7 ms (wheel 4.0, single notch 3.8).
- Fix 2 — the pointer arriving over the view kicks frames (StudioViewport, `pointerover` on the canvas): the GPU clock is up before
  the first drag. Measured, first drawn frames of a drag after 6 s rest: before 78/75/52/52/53 ms; now with the pointer resting on
  the view 16.5/17.7/17.2/17.8 ms; with the pointer arriving 500 ms early 11.4/11.6/11.7/13.7 ms.
- Not mine to decide (said to the owner): the 96 lamps are the MOXIR rig's content and 75 % of the GPU frame; a Studio light
  budget (e.g. Lite's 4 slots while navigating) is his call. Owed: an empty-page frame timer in his di browser on the 240 Hz panel
  (is 120 fps the X11 layer's cap?); the look-fade clock; CPU per frame below 4.17 ms.

## Round 7: "test yourself as a human" + "do the possible stress test"

- `scripts/nav/walkthrough.cjs`: the journey a person makes (orbit, scroll into fog, pan, scroll at the floor, double-click, right-click,
  Edit's middle button, walk, orbit again), judged per step by the real camera: net metres, median and max per-frame step, their
  ratio ("jerk"), stalls > 33 ms, console errors, a screenshot each. `scripts/nav/stress.cjs`: 60 s of rapid mixed input with a stuck
  detector, finiteness, heap and error checks. `scripts/nav/repro-edit-wheel.cjs`: Edit wheel after a pan, deterministic.
- Found by the journey and fixed, each measured before/after:
  1. Scroll at the floor: 2 cm per frame then a 6.9 m jump (jerk 69). Call-level trace: camera-controls' **dolly-to-cursor moves the
     orbit point toward the cursor in ONE frame while only the radius eases** (`_target` jumped 6.9 m in y inside `update()`). The
     wheel is now the app's own: Blender's 1.2× step of the depth under the pointer (view3d_navigate_view_zoom.cc), along the pointer
     ray (Navigate, zoom to mouse) or the view axis (Edit, his preference), eased in Navigate / instant in Edit, through surfaces with
     the depth at most doubling per notch, zoom-out bounded at far/4 (his 10-08 decision). Floor scroll jerk 69 → 2.3; 25 notches into
     fog: 2.28 m per notch constant, max frame step 0.30 m, orbit point 20 m (no collapse); 40 notches on a surface: 94 m, through.
  2. A pivot far off the view axis: camera-controls `setOrbitPoint` (focal offset 8.7 m) moved the camera 6.94 m on the next update.
     Auto Depth now sets the DEPTH on the view axis (Blender's rule), `setLookAt` with no transition: camera and aim unchanged.
     Orbit-around-selection keeps the sideways pivot; Sketchfab's double-click re-aims the camera at the point (eased).
  3. The first frame after a pause carried the whole pause as its delta (~0.7 s) and SmoothDamp finished in one frame: `clampUpdates`
     limits camera-controls' update delta to 1/15 s.
  4. After a double-click in Navigate the wheel did nothing: the Studio's own double-click (Quick Insert) opened over the view. Quick
     Insert is now the Edit tool's; Navigate's double-click focuses (Sketchfab). Esc closes Quick Insert (checked).
  5. `infinityDolly` at maxDistance pulled the orbit point toward the camera (stuck at 500 m in the stress): the app's wheel needs none.
- Stress (11–12 rounds × 60 s, several runs): camera always finite, 0 stuck after the test used uncovered canvas points, 0 console
  errors. NOT clean: stalls > 33 ms (55–225 per run) — a peer's show test was rendering in both test lanes (GPU 50–93 % before my
  runs), so the stall counts are polluted; the JS heap grew 150 → 240–350 MB per minute of stress with the test's own per-frame
  logging arrays inside the page, so a leak is NOT shown either way. Both owed: a quiet-GPU rerun and a heap run without logging.
- Journey, final run (GPU shared): every step's max/median step ratio 1.0–3.2 except double-click-then-scroll 5.6 (the eased re-aim
  overlapping the first notch); browser menu never shown; no errors; Walk 4.3 m in 1.5 s with a look.

## Round 8: "so moving stress test passed?" — the quiet-GPU rerun found what the polluted one hid

- Owed from round 7 and now done: a stress run with both test lanes empty (GPU 43 % idle, CPU 73 °C). It found **5 stuck rounds**
  the polluted runs had not: from round 8 the view sat at 656 m and every notch, in or out, was a zero step.
- The stress is now **seeded** (`NAV_SEED`, mulberry32; the seed is printed) so a run can be repeated, counts camera-controls updates by
  its `update` event (wrapping `cc.update` is undone by the preset effect on a tool switch — a test artefact that looked like a frozen
  loop), prints a `ROUND` line per round (distance, far, updates, metres moved) and ends on `about:blank`. Seed 11 reproduced it:
  10 of 12 rounds stuck at 221.047 m, trace `["wheel", 1, "-", 221.047, 0]`.
- **Cause 1** (`wheelZoomPlan`): the zoom-out bound (far/4 = 100 m here) clamped the NEW depth whenever it exceeded the bound, so a view
  already beyond it — a double-click focus or a long drag at depth put it at 221 m — got a zero step for zoom-IN too. The bound now
  applies to zoom-out only. **Cause 2** (`scripts/nav/probe-ceiling.cjs`): backing out at the centre tilted the camera under the floor;
  the pointer then grazed the floor's underside at 1.6 m and 60 notches out took a 24 m view to 2.1 m (step 0.32 m, the hit sliding).
  A zoom-out now never steps from a depth smaller than the view distance (`viewDistance` = `cc.distance`). Zoom-in is unchanged.
- Measured after, same scripts: ceiling probe 60 out → 100 m (the bound), 5 in → 40.7 m, 20 more → 11.5 m; seed 11: 0 stuck (was 10),
  seed 22: 0 stuck; camera finite, 0 console errors; stalls > 33 ms per 60 s on the quiet GPU: **10 and 15** of ~3780 frames
  (polluted runs: 55–225); JS heap over 60 s: 152 → 183 MB and 140 → 181 MB (polluted runs: 150 → 240–350), with only the test's
  frame-gap array in the page — no leak shown. Navigation unit tests 60/60; eslint clean.
- Also found and ended: a `scripts/nav/_probe.cjs` node from 13 h earlier (my own, file since deleted) still held test lane 1; the probes
  `probe-ceiling.cjs` / `probe-where.cjs` now `process.exit` so the CDP socket does not keep node alive after the page closes.
- Still owed: the lamps budget while navigating (his decision), the 10-08 nav branches, Auto Perspective, Edit numpad rows in help.
