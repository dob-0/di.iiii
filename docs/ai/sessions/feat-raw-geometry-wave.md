# The geometry wave (TD audit, wave 4 of 5)

## What changed

- **Cylinder, Cone, Torus** — primitives the entity system always had,
  finally spoken as nodes: full material ports, wired colours reaching the
  descriptor (the cube convention), each speaking its shape as a Geometry
  value. GEOMETRY_KINDS and the renderer's leaf walk learned all three, so
  they travel down wires into Arrays, Transforms, Geos and Constructors
  like the original three.
- **Transform** — re-frames one incoming shape (Position/Rotation/Scale
  around it, internal frames intact): Array's sibling for a single copy.
  Pass-through: bare it honestly carries nothing.

## Verified

Descriptor outputs with wired colour, Transform framing + bare-dead,
descriptor-kind acceptance updated (torus in, teapot still out); the
example gates all four with a Torus→Transform wire and the pass-through
proof; full suite 2547/2547; lint at baseline. SEEN (screenshot read): red
cylinder, green cone, tilted gold torus standing in the scene.
