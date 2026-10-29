# Session: fix/ux-s15-no-3d-where-flat (UX wave 3, slice S15)

Built on origin/dev 8f20185c1 (#1205 space cards was in).

## What the change replaces, and where the old stays (nothing is ever lost)
- Cards without a picture booted a hidden app each -> now a calm still. Old: MODE `?previews=live` / `localStorage dii:space-card-previews=live`.
- Wiki 3D backdrop -> flat. Old: MODE `?scene=1`.
- Front page idle room (canvas) -> flat by default, as the slice says. Old: MODE `?scene=1`; the door "Step inside" still flies into the room.
- `/api/resolve/:space` 404 for nothing-to-forward -> 200 `{ movedTo: null }`. Old clients handle both (`serverSpaces.js` 404 branch kept).
- verify-surfaces counted foreign console lines -> filtered (`verifySurfacesFilters.mjs`); own-origin errors still fail.

## Not done
OWED: (1) a real per-space picture for new visitors (server-side still stored as the space's preview asset; no such source exists today; the still shows name + blurb meanwhile) - needs the owner's yes to the name-still default or a capture job. (2) production-build network numbers for /spaces (336 requests / 2 MB before): not measured. (3) F157 (4x CPU run for one public project in the perf check): not done, owed to S60.
