import { describe, expect, it } from 'vitest'
import { movedTransforms, sameTransform } from './transformDelta.js'

// The numbers moxir-v2-9 recorded (v1264–v1303): one lamp, two Euler spellings of one pose.
const stored = { position: [3.2, 5.4, -2.15], rotation: [-3.14159265, 0, -0.5236], scale: [1, 1, 1] }
const respelled = { position: [3.2, 5.4, -2.15], rotation: [3.14159265, 1e-9, -0.5236], scale: [0.9999999, 0.9999999, 1.0000001] }

describe('transformDelta', () => {
    it('reads −π and +π about X as the same orientation', () => {
        expect(sameTransform(stored, respelled)).toBe(true)
    })

    it('sees a real move past the tolerance', () => {
        expect(sameTransform(stored, { ...stored, position: [3.2002, 5.4, -2.15] })).toBe(false)
        expect(sameTransform(stored, { ...stored, rotation: [-3.14159265, 0, -0.5226] })).toBe(false)
        expect(sameTransform(stored, { ...stored, scale: [1.001, 1, 1] })).toBe(false)
    })

    it('treats a missing field as its default', () => {
        expect(sameTransform({}, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })).toBe(true)
    })

    it('keeps only the entities that moved', () => {
        const entities = [
            { id: 'a', components: { transform: stored } },
            { id: 'b', components: { transform: stored } }
        ]
        const updates = [
            { id: 'a', transform: respelled },
            { id: 'b', transform: { ...stored, position: [4, 5.4, -2.15] } }
        ]
        expect(movedTransforms(entities, updates).map((entry) => entry.id)).toEqual(['b'])
    })
})

describe('transformChange (the commit choke point)', () => {
    it('is null when nothing moved, even re-spelled', async () => {
        const { transformChange } = await import('./transformDelta.js')
        expect(transformChange(stored, respelled)).toBeNull()
        expect(transformChange(stored, stored)).toBeNull()
    })
    it('carries only the fields that moved; the rest keep their stored numbers', async () => {
        const { transformChange } = await import('./transformDelta.js')
        expect(transformChange(stored, { ...respelled, position: [4, 5.4, -2.15] })).toEqual({ position: [4, 5.4, -2.15] })
        expect(transformChange(stored, { ...respelled, scale: [2, 2, 2] })).toEqual({ scale: [2, 2, 2] })
        expect(transformChange(stored, { ...respelled, rotation: [0, 0, 0] })).toEqual({ rotation: [0, 0, 0] })
    })
    it('holds at the 1e-4 edge, and the measured π re-spelling (7.4e-6 rad) writes nothing', async () => {
        const { transformChange } = await import('./transformDelta.js')
        expect(transformChange(stored, { position: [3.2 + 5e-5, 5.4, -2.15] })).toBeNull()
        expect(transformChange(stored, { position: [3.2 + 2e-4, 5.4, -2.15] })).not.toBeNull()
        expect(transformChange({ ...stored, rotation: [Math.PI, 0, -0.5236] }, { rotation: [3.1415853, 0, -0.5236] })).toBeNull()
    })
})
