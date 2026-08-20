# Material inputs, pass 1 (plan 3.8)

## What changed

Cube, Sphere and Plane gain four appearance ports — **Roughness, Metalness,
Emission, Opacity** — wired like any other input, so a Sound's Low band can
breathe a cube's glow. Defaults mirror a bare meshStandardMaterial
(roughness 1, metalness 0, black emission, opaque): documents that predate
the ports render pixel-identical, LOOKED at side by side.

PrimitiveMaterial (already carrying these props for Studio entities) gains
`textureLive` — a live THREE.Texture (a webcam's or Video's Frame) used as
the map directly, winning over URL-loaded textures — which let the Plane's
live-texture branch join the same material path instead of a bare inline
material.

## Honest looks, stated

- Metalness 1 renders DARK: physically correct with no environment map to
  reflect — the scene has no reflective world yet. An artist sliding
  Metalness up will see the cube go black; an environment map is future
  work, not a bug here.
- The Plane's legacy `textureUrl` branch (PlaneWithTexture) keeps its own
  material and does not yet read the new ports.

## Verified

Body props unit-proven (values through to BoxObject/SphereObject, defaults
exact); full suite 2522/2522; lint at baseline. SEEN (screenshot read):
plain / metal / half-transparent-emissive cubes side by side — back-compat
cube identical, ghost cube transmits the grid, metal cube correctly dark.
