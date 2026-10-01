import { describe, expect, it } from 'vitest'
import { Document } from '@gltf-transform/core'
import { enclosureOf } from './realism.mjs'

// MOXIR render audit E (2026-10-01): the bounce (rigBounce.js, the integrating-sphere relation
// E = Φρ / (A(1−ρ))) took A as the sum of EVERY triangle of the hall model — both faces of
// every column, truss bar and roof-frame member: 82,640 m² for a hall whose envelope is
// ~27,000 m². The return came out ~3× too dark. A is the envelope (floor, roof, walls).
const box = (doc, buffer, [x0, y0, z0], [x1, y1, z1], material) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
    const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]
    const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(v.flat())).setBuffer(buffer)
    const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(f)).setBuffer(buffer)
    const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(material)
    return doc.createNode().setMesh(doc.createMesh().addPrimitive(prim))
}

describe('the hall\'s enclosure for the bounce', () => {
    it('is the envelope the model spans, not every face of the steel inside it', () => {
        const doc = new Document()
        const buffer = doc.createBuffer()
        const grey = doc.createMaterial('concrete').setBaseColorFactor([0.2, 0.2, 0.2, 1])
        const steel = doc.createMaterial('steel').setBaseColorFactor([0.5, 0.5, 0.5, 1])
        const scene = doc.createScene()
        scene.addChild(box(doc, buffer, [0, 0, 0], [10, 5, 20], grey)) // the hall: 2(10·20 + 10·5 + 20·5) = 700 m²
        scene.addChild(box(doc, buffer, [4.9, 0, 9.9], [5.1, 5, 10.1], steel)) // a column inside it: 4.08 m²
        const e = enclosureOf(doc)
        expect(e.area_m2).toBe(700)
        expect(e.surface_m2).toBe(704) // every face, kept for the record
        expect(e.reflectance).toBeGreaterThan(0.2) // still the area-weighted mean of what is there
    })
})
