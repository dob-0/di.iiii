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
