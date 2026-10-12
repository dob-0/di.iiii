/**
 * wash-glb.mjs — the light of many lamps on the surfaces they hit, baked into
 * ONE mesh in one GLB: a lightmap for the lamps that are not real lights.
 *
 * WHY. A browser runs about eight real spot lights (rig-lib.mjs's budget; 90
 * real lights ran at 1 fps). Every other lamp draws its beam in the air and
 * lights nothing, so 42 column PARs aimed up the columns left the columns
 * dark: "the room reads dark" (owner, 2026-09-28). Their light is fixed — a
 * PAR at the foot of a column, aimed up its face — so it can be computed once
 * and drawn as a texture-free decal, which costs one draw call however many
 * lamps there are.
 *
 * METHOD (analytic direct illumination, the same model the renderer uses for
 * a real three.js SpotLight, r155+ physically based lights):
 *   E = I * spot(theta) * cos(incidence) * falloff(d)        illuminance, lux
 *   spot(theta)  = smoothstep(cos(angle), cos(angle * (1 - penumbra)), cos(theta))
 *   falloff(d)   = 1 / d^2   (decay 2; no cutoff window since 2026-10-09, rig-lib.mjs lightDistance)
 *   L            = albedo / pi * E                           Lambert radiance
 * with I the entity's intensity (candela x the rig's sceneScale), the cutoff a
 * real lamp would get (lightDistance), and the albedo of the surface's
 * material in hall.py. Sampled on a grid over the patch the lamp lands on
 * (rig-lib.mjs washSurface: a column face from the floor to the head, or the
 * press's front face), one vertex per sample, written as vertex colours.
 * Direct light only: no shadows, no bounce — the same as the real lamps with
 * shadows off.
 *
 * DRAWN AS an unlit (KHR_materials_unlit), alpha-blended decal 2 cm off the
 * surface: colour = the lamp's hue at full, alpha = L * that hue's brightest
 * channel, clipped at 1. Over a dark surface out = alpha * hue ~ L * colour,
 * which is what additive light would give (glTF cannot say additive); where
 * the wash is bright it saturates to the lamp's colour. Several lamps on one
 * patch blend rather than add — a little dimmer than the sum.
 *
 * The price, named: baked at rig.mjs time, per look. Re-aiming or recolouring
 * a column PAR in the Studio does not move its wash — re-run rig.mjs.
 */
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit } from '@gltf-transform/extensions'

import { hexToLinear } from './fixtures-glb.mjs'
import { lightDistance } from './rig-lib.mjs'

// The albedo of the surfaces washed: hall.py's base colours (linear), mean
// channel — v3 (2026-09-28): the colours sampled from the photographs (warm
// concrete, the press's dark steel). A modelled machine's face carries its own
// (`part.albedo`, from hall.json geometry.massing[].faces).
export const ALBEDO = { column: (0.36 + 0.30 + 0.20) / 3, backdrop: (0.045 + 0.041 + 0.036) / 3 }

const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}

/** Radiance (linear, before colour) at `point` on a surface with `normal`, from one wash lamp. */
export const washRadiance = (wash, point, normal, albedo) => {
    const v = point.map((c, k) => c - wash.lens[k])
    const d = Math.hypot(...v) || 1e-6
    const l = v.map((c) => c / d)
    const cosTheta = l[0] * wash.dir[0] + l[1] * wash.dir[1] + l[2] * wash.dir[2]
    const spot = smoothstep(Math.cos(wash.angle), Math.cos(wash.angle * (1 - wash.penumbra)), cosTheta)
    const cosInc = Math.max(0, -(l[0] * normal[0] + l[1] * normal[1] + l[2] * normal[2]))
    // the real lamp's cutoff: 0 since 2026-10-09 (no window, inverse square only — rig-lib.mjs lightDistance)
    const cutoff = lightDistance(wash.distance)
    const window = cutoff > 0 ? Math.min(1, Math.max(0, 1 - (d / cutoff) ** 4)) ** 2 : 1
    const falloff = (1 / Math.max(d * d, 0.01)) * window
    const E = wash.intensity * spot * cosInc * falloff
    return (albedo / Math.PI) * E
}

/** Positions, RGBA colours and indices: one grid per washed patch. */
export const washMesh = (washes, { cols = 3, rows = 24 } = {}) => {
    const positions = []
    const colors = []
    const indices = []
    let peak = 0
    for (const wash of washes) {
        const s = wash.surface
        const albedo = ALBEDO[s.kind] ?? 0.3
        const lin = hexToLinear(wash.colour)
        const top = Math.max(...lin) || 1
        const hue = lin.map((c) => c / top)
        // One patch, or (a modelled machine) one per real face the beam lands on.
        for (const part of s.parts || [s]) {
            const a0 = part.albedo ?? albedo
            const nu = s.kind === 'backdrop' ? Math.max(4, Math.min(24, Math.round(part.u[0] / 0.12))) : cols
            const nv = s.kind === 'backdrop' ? 24 : rows
            const base = positions.length / 3
            for (let j = 0; j <= nv; j += 1) {
                for (let i = 0; i <= nu; i += 1) {
                    const p = part.origin.map((o, k) => o + part.u[k] * (i / nu) + part.v[k] * (j / nv))
                    const L = washRadiance(wash, p, s.normal, a0)
                    peak = Math.max(peak, L * top)
                    positions.push(...p)
                    colors.push(hue[0], hue[1], hue[2], Math.min(1, L * top))
                }
            }
            for (let j = 0; j < nv; j += 1) {
                for (let i = 0; i < nu; i += 1) {
                    const a = base + j * (nu + 1) + i
                    const b = a + 1
                    const c = a + nu + 1
                    const d = c + 1
                    indices.push(a, b, d, a, d, c)
                }
            }
        }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices), peak }
}

/** The GLB bytes. */
export const washGlb = async (washes) => {
    const { positions, colors, indices } = washMesh(washes)
    const doc = new Document()
    const buffer = doc.createBuffer()
    const unlit = doc.createExtension(KHRMaterialsUnlit)
    const material = doc.createMaterial('rig-wash')
        .setBaseColorFactor([1, 1, 1, 1])
        .setAlphaMode('BLEND')
        .setDoubleSided(true)
        .setExtension('KHR_materials_unlit', unlit.createUnlit())
    const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(colors).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
        .setMaterial(material)
    const mesh = doc.createMesh('rig-wash').addPrimitive(prim)
    doc.createScene('rig-wash').addChild(doc.createNode('rig-wash').setMesh(mesh))
    return new NodeIO().registerExtensions([KHRMaterialsUnlit]).writeBinary(doc)
}
