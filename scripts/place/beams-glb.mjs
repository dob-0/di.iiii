/**
 * beams-glb.mjs — many lamps' beams as ONE mesh in one GLB.
 *
 * WHY THIS EXISTS (a named workaround, 2026-09-27). The real fix for a rig too
 * big to light is `components.beam.only` (a spot light entity that draws its
 * cone and casts nothing — src/objectComponents/spotBeam.js). A server built
 * before that field drops it on write, and every lamp becomes a real three.js
 * SpotLight: on the MOXIR rig that was 90 real lights and a room the owner
 * called "too laggy". Until his install carries `beam.only`, the beam-only
 * lamps are baked here instead: every cone merged into a single mesh with the
 * lamp's colour and the fade along the throw in its vertex colours, so the
 * whole rig's air is ONE draw call and no light at all. The price: those lamps
 * cannot be re-aimed in the Studio — re-run rig.mjs instead.
 *
 * The cone matches SpotLightObject's: apex at the lamp, opening down the aim,
 * as long as the lamp's reach, as wide as its angle, the same fade
 * (beamFadeAt) and the same opacity rule (spotBeamShape). glTF cannot say
 * "additive", so it is alpha-blended and unlit (KHR_materials_unlit) — a
 * little dimmer where beams cross than the live cones; it reads as haze.
 */
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit } from '@gltf-transform/extensions'

import { beamFadeAt, spotBeamShape } from '../../src/objectComponents/spotBeam.js'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

const RADIAL = 16
const RINGS = 6

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const hexToLinear = (hex) => {
    const n = parseInt(String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255))
}

const normalize = (v) => {
    const l = Math.hypot(...v) || 1
    return v.map((c) => c / l)
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Positions, RGBA colours and indices for the cones of the given spot light
 * entities (the same entities rig-lib.mjs builds).
 */
export const beamMesh = (lamps) => {
    const positions = []
    const colors = []
    const indices = []
    for (const lamp of lamps) {
        const light = lamp.components.light
        const beam = lamp.components.beam || {}
        const shape = spotBeamShape({ distance: light.distance, angle: light.angle, intensity: light.intensity, haze: beam.haze })
        const apex = lamp.components.transform.position
        const dir = normalize(spotAimDirection(lamp.components.transform.rotation))
        const helper = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
        const u = normalize(cross(dir, helper))
        const v = cross(dir, u)
        const [r, g, b] = hexToLinear(light.color)
        const base = positions.length / 3
        for (let ring = 0; ring <= RINGS; ring += 1) {
            const t = ring / RINGS
            const along = t * shape.length
            const radius = t * shape.radius
            // beamFadeAt takes the cone's own local y: +length/2 at the lamp.
            const fade = beamFadeAt(shape.length / 2 - along, shape.length)
            for (let k = 0; k < RADIAL; k += 1) {
                const a = (k / RADIAL) * Math.PI * 2
                const cu = Math.cos(a) * radius
                const cv = Math.sin(a) * radius
                positions.push(
                    apex[0] + dir[0] * along + u[0] * cu + v[0] * cv,
                    apex[1] + dir[1] * along + u[1] * cu + v[1] * cv,
                    apex[2] + dir[2] * along + u[2] * cu + v[2] * cv
                )
                colors.push(r, g, b, Math.min(1, shape.opacity * fade * 1.6))
            }
        }
        for (let ring = 0; ring < RINGS; ring += 1) {
            for (let k = 0; k < RADIAL; k += 1) {
                const a = base + ring * RADIAL + k
                const b2 = base + ring * RADIAL + ((k + 1) % RADIAL)
                const c = a + RADIAL
                const d = b2 + RADIAL
                indices.push(a, c, b2, b2, c, d)
            }
        }
    }
    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint32Array(indices)
    }
}

/** The GLB bytes. */
export const beamsGlb = async (lamps) => {
    const { positions, colors, indices } = beamMesh(lamps)
    const doc = new Document()
    const buffer = doc.createBuffer()
    const unlit = doc.createExtension(KHRMaterialsUnlit)
    const material = doc.createMaterial('rig-beams')
        .setBaseColorFactor([1, 1, 1, 1])
        .setAlphaMode('BLEND')
        .setDoubleSided(true)
        .setExtension('KHR_materials_unlit', unlit.createUnlit())
    const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(colors).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
        .setMaterial(material)
    const mesh = doc.createMesh('rig-beams').addPrimitive(prim)
    const node = doc.createNode('rig-beams').setMesh(mesh)
    doc.createScene('rig-beams').addChild(node)
    return new NodeIO().registerExtensions([KHRMaterialsUnlit]).writeBinary(doc)
}
