import { describe, expect, it } from 'vitest'
import { Euler, Matrix4, Vector3 } from 'three'
import { GROUPS, STUDIO, bayLayout, planOps, uprightFacing } from './front-room-gallery.mjs'

// The face an image entity shows, given its entity rotation: the mesh bakes
// rotation-x = -π/2 (ImageObject.jsx), so the plane's normal starts as +y.
const faceOf = (rotation) => {
    const m = new Matrix4().makeRotationFromEuler(new Euler(...rotation, 'XYZ'))
    return new Vector3(0, 1, 0).applyMatrix4(m)
}

describe('front-room gallery', () => {
    it('stands a slide up facing the direction asked for', () => {
        for (const theta of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            const f = faceOf(uprightFacing(theta))
            expect(f.x).toBeCloseTo(Math.sin(theta), 5)
            expect(f.y).toBeCloseTo(0, 5)
            expect(f.z).toBeCloseTo(Math.cos(theta), 5)
        }
    })

    it('places every slide of a bay once, the back wall facing the path', () => {
        const bay = bayLayout([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 22, 'north')
        expect(bay.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        expect(faceOf(bay.slides[0].rotation).z).toBeCloseTo(1, 5)   // north bay's back wall faces +z, the path
    })

    it('uses no slide twice across the whole layout', () => {
        const all = [...STUDIO, ...GROUPS.flatMap((g) => g.slides), 77]
        expect(new Set(all).size).toBe(all.length)
    })

    it('hides what it does not place, and never deletes', () => {
        const doc = {
            assets: [{ id: 'a1', name: 'x__24.webp' }, { id: 'a2', name: 'x__29.webp' }],
            entities: [
                { id: 'e1', type: 'image', components: { media: { assetId: 'a1' } } },
                { id: 'e2', type: 'image', components: { media: { assetId: 'a2' } } }
            ]
        }
        const plan = planOps(doc)
        expect(plan.ops.some((o) => o.type === 'deleteEntity')).toBe(false)
        const hide = plan.ops.find((o) => o.payload.entityId === 'e2')
        expect(hide.payload.patch.components.runtime.visible).toBe(false)
        expect(plan.placed).toBe(1)
    })

    it('updates its own entities on a second run instead of adding copies', () => {
        const first = planOps({ assets: [], entities: [] })
        const created = first.ops.filter((o) => o.type === 'createEntity').map((o) => o.payload.entity)
        const second = planOps({ assets: [], entities: created })
        expect(second.ops.filter((o) => o.type === 'createEntity')).toHaveLength(0)
        expect(second.ops.filter((o) => o.type === 'updateEntity')).toHaveLength(created.length)
    })
})
