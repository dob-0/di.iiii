// THE HALL'S SURFACES, CORRECTED AT LOAD — `renderSettings.surfaces` overrides a named
// material of the room's models when the room is drawn, without rebuilding the model
// (the hall GLB is shared by every MOXIR room; scripts/place/hall.py stays as it is).
//
// Why the floor (owner's call, 2026-10-01: "override the floor"): hall.py samples the
// floor's colour from daylight photographs of the hall (dusty concrete, ~7 % reflectance)
// and makes it fully matte (roughness 0.95). At 0.95 the GGX highlight of every one of the
// room's lamps is spread to nothing, so pools and lenses never sheen on the concrete, and a
// near-black floor swallowed the footprints. A club's concrete is worn: trodden lanes and
// scuffs polished smooth (troweled concrete 0.5–0.65, sealed 0.2–0.4; unsealed 0.8–0.95 —
// artist-practice ranges, research note 2026-10-01), dirty concrete ~0.12–0.2 reflectance.
// The hue sampled from the photographs is kept; only its level and its finish change.
//
//   surfaces: { floor: { albedo: 1.7,        the sampled colour × this (0.07 → ~0.12)
//                        roughness: 0.6,     the mean finish
//                        variation: 0.25,    ± around it, by a world-space wear pattern
//                        scale: 0.35,        the pattern's cycles per metre
//                        reflect: 0.5 } }    the strength of the beams' reflection in it
//                                            (BeamMirrors.jsx), 0 = none
import { AlwaysStencilFunc, ReplaceStencilOp } from 'three'

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

export const FLOOR_DEFAULTS = { albedo: 1.7, roughness: 0.6, variation: 0.25, scale: 0.35, reflect: 0.5 }

/** The overrides a room asks for, cleaned: { [materialName]: {...} }, or null. */
export const surfacesOf = (renderSettings) => {
    const s = renderSettings?.surfaces
    if (!s || typeof s !== 'object') return null
    const out = {}
    for (const [name, v] of Object.entries(s)) {
        if (!v || typeof v !== 'object' || v.enabled === false) continue
        const d = name === 'floor' ? FLOOR_DEFAULTS : { albedo: 1, roughness: 0.6, variation: 0, scale: 0.35, reflect: 0 }
        out[name] = {
            albedo: clamp(num(v.albedo, d.albedo), 0.1, 6),
            roughness: clamp(num(v.roughness, d.roughness), 0.04, 1),
            variation: clamp(num(v.variation, d.variation), 0, 0.5),
            scale: clamp(num(v.scale, d.scale), 0.01, 10),
            reflect: clamp(num(v.reflect, d.reflect), 0, 2)
        }
    }
    return Object.keys(out).length ? out : null
}

// The wear pattern, in GLSL and in JS (tests): two octaves of smooth value noise over the
// floor's world X/Z, 0..1. Lanes where people walk are smoother; this is a stand-in for them.
const fract = (x) => x - Math.floor(x)
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
const vnoise = (x, y) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy)
    const b = hash(ix + 1, iy)
    const c = hash(ix, iy + 1)
    const d = hash(ix + 1, iy + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
export const wearAt = (x, z, scale) => 0.65 * vnoise(x * scale, z * scale) + 0.35 * vnoise(x * scale * 3.1, z * scale * 3.1)
/** The roughness the floor has at a world point. */
export const roughnessAt = (x, z, o) => clamp(o.roughness + o.variation * (wearAt(x, z, o.scale) - 0.5) * 2, 0.04, 1)

export const WEAR_GLSL = /* glsl */`
float surfHash(vec2 p) { return fract(sin(p.x * 127.1 + p.y * 311.7) * 43758.5453); }
float surfNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = surfHash(i);
    float b = surfHash(i + vec2(1.0, 0.0));
    float c = surfHash(i + vec2(0.0, 1.0));
    float d = surfHash(i + vec2(1.0, 1.0));
    return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float surfWear(vec2 p, float s) { return 0.65 * surfNoise(p * s) + 0.35 * surfNoise(p * s * 3.1); }
`

/**
 * A neighbour of a reflecting surface in the same mesh (one draw, several materials): it
 * clears the stencil mark where it is drawn, so a column drawn after the floor in that draw
 * never carries the floor's reflection. A clone; the model's own material is untouched.
 */
export const stencilClearingMaterial = (material) => {
    const m = material.clone()
    m.stencilWrite = true
    m.stencilRef = 0
    m.stencilFunc = AlwaysStencilFunc
    m.stencilZPass = ReplaceStencilOp
    m.userData.surfaceOverride = { clearsStencil: true }
    return m
}

/** A material with the override applied: a clone (the model's own stays as loaded). */
export const overriddenMaterial = (material, o) => {
    const m = material.clone()
    m.color.multiplyScalar(o.albedo)
    m.roughness = o.roughness
    m.userData.surfaceOverride = o
    if (o.reflect > 0) {
        // MARK WHERE THE FLOOR IS SEEN, for the beams' reflections (BeamMirrors.jsx): the floor
        // writes stencil 1 wherever it passes the depth test. The floor's mesh is drawn LAST of
        // the opaque room (SurfaceOverrides sets its renderOrder), so anything standing in front
        // has already won the depth there and the floor marks only the floor that shows.
        m.stencilWrite = true
        m.stencilRef = 1
        m.stencilFunc = AlwaysStencilFunc
        m.stencilZPass = ReplaceStencilOp
    }
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uSurfVariation = { value: o.variation }
        shader.uniforms.uSurfScale = { value: o.scale }
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vSurfWorld;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSurfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vSurfWorld;\nuniform float uSurfVariation;\nuniform float uSurfScale;\n${WEAR_GLSL}`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + uSurfVariation * (surfWear(vSurfWorld.xz, uSurfScale) - 0.5) * 2.0, 0.04, 1.0);')
    }
    m.customProgramCacheKey = () => `surface-override:${o.variation}:${o.scale}`
    m.needsUpdate = true
    return m
}
