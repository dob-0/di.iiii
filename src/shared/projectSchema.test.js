import { describe, expect, it } from 'vitest'
import {
    applyProjectOps,
    normalizeProjectDocument
} from './projectSchema.js'

describe('projectSchema', () => {
    it('normalizes a sparse project document', () => {
        const document = normalizeProjectDocument({
            projectMeta: {
                title: 'Test Project'
            },
            entities: [{
                type: 'sphere',
                components: {
                    transform: {
                        position: [1, 'bad', 3]
                    }
                }
            }]
        })

        expect(document.projectMeta.title).toBe('Test Project')
        expect(document.version).toBe(2)
        expect(document.entities).toHaveLength(1)
        expect(document.entities[0].components.transform.position).toEqual([1, 0, 3])
        expect(document.presentationState.mode).toBe('scene')
        expect(document.publishState.shareEnabled).toBe(false)
        expect(document.windowLayout.windows.viewport.visible).toBe(true)
    })

    it('applies entity and world ops to a project document', () => {
        const nextDocument = applyProjectOps(normalizeProjectDocument({}), [
            {
                type: 'createEntity',
                payload: {
                    entity: {
                        id: 'entity-1',
                        type: 'box',
                        name: 'Test Box'
                    }
                }
            },
            {
                type: 'updateComponent',
                payload: {
                    entityId: 'entity-1',
                    component: 'transform',
                    patch: {
                        position: [2, 1, -4]
                    }
                }
            },
            {
                type: 'setWorldState',
                payload: {
                    patch: {
                        backgroundColor: '#111111'
                    }
                }
            }
        ])

        expect(nextDocument.entities).toHaveLength(1)
        expect(nextDocument.entities[0].components.transform.position).toEqual([2, 1, -4])
        expect(nextDocument.worldState.backgroundColor).toBe('#111111')
    })

    it('applies presentation and publish ops while tolerating legacy window state ops', () => {
        const nextDocument = applyProjectOps(normalizeProjectDocument({
            windowLayout: {
                windows: {
                    assets: {
                        visible: false
                    }
                }
            }
        }), [
            {
                type: 'setPresentationState',
                payload: {
                    patch: {
                        mode: 'fixed-camera',
                        fixedCamera: {
                            position: [4, 3, 2],
                            target: [0, 1, 0]
                        }
                    }
                }
            },
            {
                type: 'setPublishState',
                payload: {
                    patch: {
                        shareEnabled: true,
                        xrDefaultMode: 'vr'
                    }
                }
            },
            {
                type: 'setWindowState',
                payload: {
                    windowId: 'assets',
                    patch: {
                        visible: true
                    }
                }
            }
        ])

        expect(nextDocument.presentationState.mode).toBe('fixed-camera')
        expect(nextDocument.presentationState.fixedCamera.position).toEqual([4, 3, 2])
        expect(nextDocument.publishState.shareEnabled).toBe(true)
        expect(nextDocument.publishState.xrDefaultMode).toBe('vr')
        expect(nextDocument.windowLayout.windows.assets.visible).toBe(true)
    })
})
