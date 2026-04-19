import { describe, expect, it } from 'vitest'
import {
    PROJECT_DOCUMENT_VERSION,
    PROJECT_ROOT_NODE_ID,
    PROJECT_VIEW_ROOT_NODE_ID,
    PROJECT_WORLD_ROOT_NODE_ID,
    applyProjectOps,
    normalizeProjectDocument
} from './projectSchema.js'

describe('projectSchema', () => {
    it('normalizes a sparse project document into the recursive node core', () => {
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
        expect(document.version).toBe(PROJECT_DOCUMENT_VERSION)
        expect(document.rootNodeId).toBe(PROJECT_ROOT_NODE_ID)
        expect(document.nodes.map((node) => node.id)).toEqual(
            expect.arrayContaining([PROJECT_ROOT_NODE_ID, PROJECT_WORLD_ROOT_NODE_ID, PROJECT_VIEW_ROOT_NODE_ID])
        )
        expect(document.entities).toHaveLength(1)
        expect(document.entities[0].components.transform.position).toEqual([1, 0, 3])
        expect(document.worldState.backgroundColor).toBe('#ffffff')
        expect(document.windowLayout.windows.assets.visible).toBe(false)
    })

    it('migrates legacy world and window state into nodes', () => {
        const document = normalizeProjectDocument({
            version: 2,
            worldState: {
                backgroundColor: '#111111',
                gridVisible: true,
                gridSize: 18
            },
            windowLayout: {
                windows: {
                    inspector: {
                        visible: true,
                        x: 720,
                        y: 120,
                        width: 320,
                        height: 440,
                        zIndex: 9
                    }
                }
            }
        })

        expect(document.nodes.some((node) => node.definitionId === 'world.color')).toBe(true)
        expect(document.nodes.some((node) => node.definitionId === 'world.grid')).toBe(true)
        expect(document.nodes.some((node) => node.definitionId === 'view.inspector')).toBe(true)
        expect(document.worldState.backgroundColor).toBe('#111111')
        expect(document.worldState.gridVisible).toBe(true)
        expect(document.windowLayout.windows.inspector.visible).toBe(true)
        expect(document.windowLayout.windows.inspector.width).toBe(320)
    })

    it('applies node ops and mirrors them back into legacy world and window state', () => {
        const nextDocument = applyProjectOps(normalizeProjectDocument({}), [
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'node-cube-1',
                        definitionId: 'geom.cube',
                        label: 'Cube',
                        family: 'geom',
                        parentId: PROJECT_WORLD_ROOT_NODE_ID,
                        mount: { surface: 'world', mode: 'spatial' },
                        params: {
                            color: '#33aa66',
                            size: [2, 3, 4]
                        },
                        spatial: {
                            position: [3, 0.5, -2]
                        }
                    }
                }
            },
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'node-inspector-1',
                        definitionId: 'view.inspector',
                        label: 'Inspector',
                        family: 'view',
                        parentId: PROJECT_VIEW_ROOT_NODE_ID,
                        mount: { surface: 'view', mode: 'panel' },
                        params: { title: 'Inspector' },
                        frame: {
                            x: 640,
                            y: 160,
                            width: 320,
                            height: 400,
                            visible: true,
                            zIndex: 11
                        }
                    }
                }
            },
            {
                type: 'setWorldState',
                payload: {
                    patch: {
                        backgroundColor: '#222244'
                    }
                }
            }
        ])

        expect(nextDocument.nodes.some((node) => node.id === 'node-cube-1')).toBe(true)
        expect(nextDocument.worldState.backgroundColor).toBe('#222244')
        expect(nextDocument.nodes.find((node) => node.definitionId === 'world.color')?.params?.color).toBe('#222244')
        expect(nextDocument.windowLayout.windows.inspector.visible).toBe(true)
        expect(nextDocument.windowLayout.windows.inspector.width).toBe(320)
        expect(nextDocument.workspaceState.activeSurface).toBe('world')
    })

    it('derives world grid and camera state from node params', () => {
        const nextDocument = applyProjectOps(normalizeProjectDocument({}), [
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'node-grid-1',
                        definitionId: 'world.grid',
                        label: 'World Grid',
                        family: 'world',
                        parentId: PROJECT_WORLD_ROOT_NODE_ID,
                        mount: { surface: 'world', mode: 'hidden' },
                        params: {
                            visible: true,
                            size: 42
                        }
                    }
                }
            },
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'node-camera-1',
                        definitionId: 'world.camera',
                        label: 'World Camera',
                        family: 'world',
                        parentId: PROJECT_WORLD_ROOT_NODE_ID,
                        mount: { surface: 'world', mode: 'hidden' },
                        params: {
                            mode: 'perspective',
                            position: [2, 3, 4],
                            target: [0, 1, 0]
                        }
                    }
                }
            }
        ])

        expect(nextDocument.worldState.gridVisible).toBe(true)
        expect(nextDocument.worldState.gridSize).toBe(42)
        expect(nextDocument.worldState.savedView.position).toEqual([2, 3, 4])
        expect(nextDocument.worldState.savedView.target).toEqual([0, 1, 0])
    })
})
