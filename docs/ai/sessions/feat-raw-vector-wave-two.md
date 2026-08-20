## What this branch does

Six more pure operators from the TouchDesigner-audit remainder — the second
vector wave. Dot (agreement + angle in degrees), Cross (perpendicular),
Direction (normalise, zero stays zero), Rotation (Rodrigues spin around an
axis, degrees), Aim (the euler that makes a shape's +Z face a target —
dependency-free, proven against three's lookAt in the tests), and Random
(one fixed draw per Variant, the still counterpart to Noise).

## Where things stand

All six are colocated runtimes under `src/project/nodes/<typeId>/runtime.js`,
registered in NODE_RUNTIMES and the registry (numbers family), wired into the
all-nodes example, and covered by behaviour tests including an exact
three-comparison for Aim. No clock involvement — all six are pure.

## Decisions worth keeping

- Angles a person types are degrees (Rotation's Angle input, Dot's Angle
  output). Rotations a wire carries are radians, because they plug straight
  into three (Aim's output). The wiki row says which is which.
- "Face" means the flat +Z side, the way a monitor faces you.
- Matrix and Curve from the audit were NOT built — without a real mesh lane
  they would be shells; they move to the mesh-workshop project.
