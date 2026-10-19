import { describe, expect, it } from 'vitest'
import { clearFromKey, clearTransformOps } from './clearTransform.js'

const lamp = (id, transform, locked = false) => ({ id, components: { transform, runtime: locked ? { locked: true } : {} } })

describe('Alt+G / Alt+R / Alt+S (Blender: Clear Location / Rotation / Scale)', () => {
    it('reads Alt+G/R/S by letter or by key place; Ctrl, Shift, Cmd or no Alt is no clear', () => {
        expect(clearFromKey({ altKey: true, key: 'g' })).toBe('location')
        expect(clearFromKey({ altKey: true, key: '®', code: 'KeyR' })).toBe('rotation')
        expect(clearFromKey({ altKey: true, key: 'ս', code: 'KeyS' })).toBe('scale')
        expect(clearFromKey({ key: 'g' })).toBe(null)
        expect(clearFromKey({ altKey: true, ctrlKey: true, key: 'g' })).toBe(null)
        expect(clearFromKey({ altKey: true, shiftKey: true, key: 'G' })).toBe(null)
        expect(clearFromKey({ altKey: true, key: 'a' })).toBe(null)
    })

    it('one op per selected, unlocked entity that is not already at rest', () => {
        const entities = [
            lamp('a', { position: [1, 2, 3], rotation: [-Math.PI, 0, 0], scale: [1, 1, 1] }),
            lamp('b', { position: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2] }),
            lamp('c', { position: [5, 0, 0], rotation: [0.3, 0, 0], scale: [1, 1, 1] }, true),
            lamp('d', { position: [9, 9, 9], rotation: [1, 1, 1], scale: [3, 3, 3] }),
        ]
        const ids = ['a', 'b', 'c']
        expect(clearTransformOps(entities, ids, 'rotation')).toEqual([
            { type: 'updateComponent', payload: { entityId: 'a', component: 'transform', patch: { rotation: [0, 0, 0] } } },
        ])
        expect(clearTransformOps(entities, ids, 'scale').map((op) => op.payload.entityId)).toEqual(['b'])
        expect(clearTransformOps(entities, ids, 'location').map((op) => op.payload.patch)).toEqual([{ position: [0, 0, 0] }])
        expect(clearTransformOps(entities, ids, 'nonsense')).toEqual([])
    })
})
