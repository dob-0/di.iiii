# Audit — the view page's walk, one look on every device (2026-10-14)

Method: Nielsen heuristics (consistency, user control and freedom) + WCAG 2.2 2.5.7 (a single-pointer way for every drag), over the brief's device matrix.
Standard followed: Sketchfab Help "Navigation" (drag to look, WASD/arrows to move, a stick on touch).

| id | where | ref | device | sev | finding | size | state |
|---|---|---|---|---|---|---|---|
| N1 | Walker desktop branch | consistency, control | mouse | 3 | click took a pointer lock AND armed drag-look AND a crosshair cursor; Esc was eaten once by the browser | S | fixed |
| N2 | wheel listener | control | touchpad | 3 | pinch (ctrlKey) ignored, so the browser zooms the page; listener passive, so scroll / back-swipe leak | S | fixed |
| N3 | hint line | consistency | mouse | 2 | "Click to explore" / "ESC · release" described the lock | S | fixed |
| N4 | Safari touchpad pinch | control | touchpad | 2 | gesture events not handled | S | fixed (untested on Safari) |
| N5 | `scripts/input-check.mjs` | - | - | 2 | asserted the lock and "pinch ignored" | S | rewritten |
| N6 | touch walk | WCAG 2.5.7 | phone/tablet | - | stick + right-half look already present; unchanged | - | not re-measured |
| N7 | Studio walk (`useWalkNavigation.js`), Build surface (`BuildSurface.jsx`, `RigSteps.jsx`) still use pointer lock | consistency | mouse | 2 | other owners | M | OPEN |

Matrix: mouse+keyboard 1440x900 @1x/@2x, touchpad, phone 390x844 @3x, tablet 820x1180, keyboard only. Script: `scripts/audit/viewer-navigation.cjs`.

## UNVERIFIED
No row was measured in a browser: the cloud sandbox has no serverXR, the scene never mounts, and the walk script printed nothing. Unit tests of the input maths are the only measured evidence. Real touchpad, Safari gestures and a phone are for the lead and the owner.
