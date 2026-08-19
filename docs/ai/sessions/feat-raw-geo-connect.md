# feat/raw-geo-connect — geos connect, and the demo stops trespassing

Owner, 2026-08-20: "its still conflict with backdrop display and geo, i can't
add multigeos and connect and make multiply geometries … create geometry
inside geometry". Reproduced live: placing several Geos, a stray double-click
hit a door (silent scope change) and another hit "Make me a scene" — which
injected the six-node demo INTO the fresh Geo, stacking a demo World window
over the backdrop. That stack was the "conflict". And Geos had no output, so
nothing could connect them.

## What changed

- `geom.geo` gains a **Geometry output**: everything spatial standing in it,
  as one group in the Geo's own transform (nodeGraphRuntime case). A Geo
  inside a Geo answers recursively; a Light/Camera standing there is not a
  shape and is skipped; an EMPTY Geo answers undefined (the Merge rule —
  an empty place is not an invisible shape). Listed in PASS_THROUGH_PORTS
  with a containment-based proving fixture.
- "Make me a scene" only offers itself on a truly blank desk at the top
  level (`currentScopeId === null && nodes.length === 0`); the ⋯ menu still
  offers it anywhere, deliberately.
- Runtime tests: empty geo, collected group + transform, recursive nesting,
  Geo→Merge composition. RawEditor tests for the demo scoping. Wiki + manual.

## Verify

Seeded doc, read at DPR 2: Geo A (cube + inner Geo with sphere) and Geo B
(plane) wired through Merge into a Constructor's door — the Constructor
visibly wears the union of both scenes; Geometry sockets visible on the Geo
cards.

## Still open (the visual conflict)

Cards still land over their own 3D objects and the 3D labels float detached —
the layering fight is the next cut, tracked in the desk audit memory.
