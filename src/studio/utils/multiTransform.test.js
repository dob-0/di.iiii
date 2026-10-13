import { describe, expect, it } from 'vitest'
import { applyPivotTransform, createPivotDrag, getSelectionCentroid } from './multiTransform.js'

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

describe('the multi-selection gizmo drag (createPivotDrag)', () => {
    // Five lamps as the lead left them in moxir-v2-9 — rotations near ±π, where a matrix round
    // trip re-spells the Euler angles and leaves scale at 0.9999….
    const lamps = Array.from({ length: 5 }, (_, index) => ({
        id: `lamp-${index}`,
        components: { transform: { position: [index * 1.37, 5.4, -0.83 * index], rotation: [-Math.PI, 0, -0.5236], scale: [1, 1, 1] } }
    }))
    const setup = (pivot = { position: [2.74, 5.4, -1.66], rotation: [0.3, 1.1, -0.4], scale: [1, 1, 1] }) => {
        const commits = []
        let entities = lamps
        let current = pivot
        const drag = createPivotDrag({
            readPivot: () => current,
            getEntities: () => entities,
            onPreview: () => {},
            onCommit: (list) => commits.push(list)
        })
        return {
            drag,
            commits,
            setEntities: (next) => { entities = next },
            movePivot: (next) => { current = next }
        }
    }

    it('writes nothing when the document changes and nobody touched the gizmo', () => {
        const { drag, commits, setEntities } = setup()
        for (let round = 0; round < 8; round += 1) {
            setEntities(lamps.map((lamp) => ({ ...lamp, components: { transform: { ...lamp.components.transform, position: [round, 5.4, 0] } } })))
            drag.objectChange()
        }
        expect(commits).toEqual([])
    })

    it('writes nothing for a press and release on a handle with no motion', () => {
        const { drag, commits } = setup()
        for (let round = 0; round < 8; round += 1) {
            drag.draggingChanged(true)
            drag.draggingChanged(false)
        }
        expect(commits).toEqual([])
    })

    it('a release with no grab before it writes nothing', () => {
        const { drag, commits } = setup()
        drag.draggingChanged(false)
        expect(commits).toEqual([])
    })

    it('commits the moved lamps, against the selection read at the grab', () => {
        const { drag, commits, setEntities, movePivot } = setup({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
        drag.draggingChanged(true)
        setEntities([]) // a remote change mid-drag does not change what this drag moves
        movePivot({ position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
        drag.draggingChanged(false)
        expect(commits).toHaveLength(1)
        expect(commits[0].map((entry) => entry.id)).toEqual(lamps.map((lamp) => lamp.id))
        expect(commits[0][1].transform.position[0]).toBeCloseTo(2.37, 9)
    })
})
