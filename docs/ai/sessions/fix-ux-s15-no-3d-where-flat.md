# Session: fix/ux-s15-no-3d-where-flat (UX wave 3, slice S15)

Built on origin/dev 8f20185c1 (#1205 space cards was in).

## What the change replaces, and where the old stays (nothing is ever lost)
- Cards without a picture booted a hidden app each -> now a calm still. Old: MODE `?previews=live` / `localStorage dii:space-card-previews=live`.
- Wiki 3D backdrop -> flat. Old: MODE `?scene=1`.
- Front page idle room under reduced-motion -> off. Old: `?scene=1`; the door still flies into the room.
- `/api/resolve/:space` 404 for nothing-to-forward -> 200 `{ movedTo: null }`. Old clients handle both (`serverSpaces.js` 404 branch kept).
- verify-surfaces counted foreign console lines -> filtered (`verifySurfacesFilters.mjs`); own-origin errors still fail.

## Not done
See the result file: no production-build network numbers, F157 (4x CPU run) not added.
