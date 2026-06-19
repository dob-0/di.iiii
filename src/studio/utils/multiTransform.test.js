import { describe, expect, it } from 'vitest'
import { applyPivotTransform, getSelectionCentroid } from './multiTransform.js'

const entities = [
    { id: 'left', components: { transform: { position: [-1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } },
    { id: 'right', components: { transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } }
]

describe('Studio multi-selection transforms', () => {
    it('finds the selection centroid', () => {
        expect(getSelectionCentroid(entities)).toEqual([0, 0, 0])
    })

    it('moves every selected entity by the pivot delta', () => {
        const updates = applyPivotTransform(
            entities,
            { position: [0, 0, 0] },
            { position: [2, 3, 0] }
        )

        expect(updates.map((entry) => entry.transform.position)).toEqual([
            [1, 3, 0],
            [3, 3, 0]
        ])
    })

    it('scales entities around the shared pivot', () => {
        const updates = applyPivotTransform(
            entities,
            { position: [0, 0, 0] },
            { position: [0, 0, 0], scale: [2, 2, 2] }
        )

        expect(updates.map((entry) => entry.transform.position)).toEqual([
            [-2, 0, 0],
            [2, 0, 0]
        ])
        expect(updates.map((entry) => entry.transform.scale)).toEqual([
            [2, 2, 2],
            [2, 2, 2]
        ])
    })
})
