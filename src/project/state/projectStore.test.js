import { describe, expect, it } from 'vitest'
import { createProjectStoreState, projectStoreReducer } from './projectStore.js'

const document = {
    entities: [
        { id: 'a', type: 'box', name: 'A' },
        { id: 'b', type: 'box', name: 'B' }
    ]
}

describe('projectStore selection', () => {
    it('deduplicates selection and ignores unknown entity ids', () => {
        const state = createProjectStoreState({ document })
        const next = projectStoreReducer(state, {
            type: 'select-entities',
            entityIds: ['a', 'a', 'missing', 'b']
        })

        expect(next.selectedEntityIds).toEqual(['a', 'b'])
        expect(next.selectedEntityId).toBe('b')
    })

    it('prunes selection when a selected entity is deleted', () => {
        const selected = projectStoreReducer(createProjectStoreState({ document }), {
            type: 'select-entities',
            entityIds: ['a', 'b']
        })
        const next = projectStoreReducer(selected, {
            type: 'apply-ops',
            ops: [{ type: 'deleteEntity', payload: { entityId: 'b' } }]
        })

        expect(next.selectedEntityIds).toEqual(['a'])
        expect(next.selectedEntityId).toBe('a')
    })
})
