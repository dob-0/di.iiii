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

describe('projectStoreReducer', () => {
    it('loads project state and applies optimistic ops', () => {
        let state = createProjectStoreState()

        state = projectStoreReducer(state, {
            type: 'load-success',
            document: {
                projectMeta: {
                    title: 'Reducer Test'
                },
                entities: []
            },
            version: 2
        })

        expect(state.document.projectMeta.title).toBe('Reducer Test')
        expect(state.version).toBe(2)

        state = projectStoreReducer(state, {
            type: 'apply-ops',
            version: 3,
            ops: [{
                type: 'createEntity',
                payload: {
                    entity: {
                        id: 'entity-1',
                        type: 'text',
                        name: 'Title Card'
                    }
                }
            }]
        })

        expect(state.version).toBe(3)
        expect(state.document.entities[0].name).toBe('Title Card')

        state = projectStoreReducer(state, {
            type: 'set-version',
            version: 4
        })

        expect(state.version).toBe(4)
        expect(state.document.entities[0].name).toBe('Title Card')
    })
})
