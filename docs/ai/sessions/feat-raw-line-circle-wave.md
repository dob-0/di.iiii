## What this branch does

Line and Circle — the last two pure-geometry singles from the
TouchDesigner-audit remainder. Line is a stroke between two wirable
endpoints, drawn as a thin cylinder (GPU line width is unreliable across
platforms), steered by two nested groups — yaw about Y, tilt about X —
no quaternion, no new three import. Circle is a flat disc facing +Z,
Plane's round sibling, with the standard material inputs.

## Where things stand

Both are colocated runtimes answering Geometry descriptors, so Array can
build a fence out of Lines and Transform can carry a Circle. GEOMETRY_KINDS
gains 'line' and 'circle'; GeometryPieces renders both as leaves;
renderNodeBody renders both standing. Wired into the all-nodes example,
behaviour-tested including a Line-through-Array pruner pass.

## Decisions worth keeping

- Line has NO position/rotation inputs — the endpoints ARE the placement.
- Circle stands vertical by default like Plane; rotate it to lay a mark on
  the floor. Consistency beat the theatrical default on purpose.
