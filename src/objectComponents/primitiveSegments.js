// How finely the viewport builds each round primitive — ONE module, read by the mesh components
// (SphereObject, CylinderObject, ConeObject, TorusObject, RawViewport's circle) and by Laser Trace
// (src/project/nodes/laser.trace), so the laser draws the same mesh the viewport shows (2026-10-14).
export const SPHERE_WIDTH_SEGMENTS = 32
export const SPHERE_HEIGHT_SEGMENTS = 32
export const CYLINDER_RADIAL_SEGMENTS = 32
export const CONE_RADIAL_SEGMENTS = 32
export const TORUS_RADIAL_SEGMENTS = 24
export const TORUS_TUBULAR_SEGMENTS = 48
export const CIRCLE_SEGMENTS = 48
