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
