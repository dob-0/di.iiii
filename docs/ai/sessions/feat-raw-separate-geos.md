# Raw: separate geos — the room picks up the place

## What the owner hit

"now the same cubes in the 2 geos.. i want to seperate geos." Two geos, a cube
in each: the room showed two identical cubes HOVERING side by side, a click on
either selected the CUBE (the Geo was unreachable from the room), and a drag —
which did move the Geo — teleported it (measured: an 80px downward move threw
a geo from z=0 to z=13.8, because a Geo floated at y=1.2, near the camera's
eye line, where the drag plane's depth axis explodes).

## What changed

- `nodeGraphAuthoring.js`: a Geo is a PLACE — it spawns ON the floor
  (liftY 0), not lifted 1.2 like a primitive. Point-placement lands exactly
  where pointed; the step-aside ring stays at y=0.
- `nodeGraphRuntime.js`: the geometry-output position fallback matches the
  registry default ([0,0,0], was [0,1.2,0]).
- `RawViewport.jsx`: the room selects what stands in THIS room. A nested node
  carries no click of its own, so clicking a cube inside a Geo picks up the
  GEO — pill says Geo, inspector edits the Geo, dragging parts the geos.
  Enter the Geo and the cube is scope-level there, selectable again.
- `RawViewport.jsx`: drag clamped to the grid (±40 on x/z, lift capped at 40)
  so a near-horizon move can never throw a thing off past the camera.

## Verified

Palette flow end to end in the browser (DPR 2, screenshots read): two geos
spawn at y=0 stepped apart; cubes stand ON the floor; click → pill "Geo",
inspector Geo 0/0/0; the gesture that previously teleported to z=13.8 moves
the geo a calm 2.7 units. Full suite 2436/2436, lint, build, anatomy, wiki
checks green. Manual + wiki updated in the same change.
