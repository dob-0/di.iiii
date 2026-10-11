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
