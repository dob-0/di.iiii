import { describe, expect, it } from 'vitest'
import { createProjectStoreState, projectStoreReducer } from './projectStore.js'

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
    })
})
