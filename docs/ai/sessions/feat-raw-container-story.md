# The container story (plan PR 2.5)

## What changed

- universe.desk.3d retires from the palette (paletteHidden): its role — a
  place in the scene that renders its children — is exactly Geo's job, and
  two containers with one job was the zoo. Existing desks keep working
  (shell body, children, doors untouched).
- The interior-rendering rule is written ONCE, at CONTAINER_TYPE_IDS: Geo
  and 3D Desk draw their children; Scene and Constructor suppress; the
  hidden containers never stand in the room. The anatomy sheet's container
  sentence now derives to Scene · Kiosk · Geo · Studio · Constructor
  automatically (PLACEABLE_CONTAINER_LABELS reads the palette).
- All-nodes example: desk removed, doorways moved inside the Geo, the stale
  'Stage' label corrected to Kiosk. Wiki states the one rule and the desk's
  retirement.

## Verified

Full suite 2486/2486, lint clean, build/anatomy/wiki/docs green.
