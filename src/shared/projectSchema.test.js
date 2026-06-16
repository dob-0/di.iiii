import { describe, expect, it } from 'vitest'
import {
    PROJECT_DOCUMENT_VERSION,
    applyProjectOps,
    normalizeProjectDocument
} from './projectSchema.js'

describe('projectSchema', () => {
    it('normalizes a sparse project document into the flat node language shape', () => {
        const document = normalizeProjectDocument({
            projectMeta: { title: 'Test Project' },
            entities: [{
                type: 'sphere',
                components: { transform: { position: [1, 'bad', 3] } }
            }]
        })

        expect(document.projectMeta.title).toBe('Test Project')
        expect(document.version).toBe(PROJECT_DOCUMENT_VERSION)
        expect(document.nodes).toEqual([])
        expect(document.edges).toEqual([])
        expect(document.entities).toHaveLength(1)
        expect(document.entities[0].components.transform.position).toEqual([1, 0, 3])
        expect(document.windowLayout.windows.assets.visible).toBe(false)
    })

    it('migrates v3 old-shape nodes and edges into v4 new-shape', () => {
        const document = normalizeProjectDocument({
            version: 3,
            rootNodeId: 'root-node',
            nodes: [
                { id: 'root-node', definitionId: 'core.project', label: 'Root' },
                { id: 'world-root', definitionId: 'world.root', label: 'World Root' },
                { id: 'view-root', definitionId: 'view.root', label: 'View Root' },
                {
                    id: 'cube-1',
                    definitionId: 'geom.cube',
                    label: 'Cube',
                    params: { color: '#33aa66', size: [2, 3, 4], canvasPosition: { x: 120, y: 80 } },
                    spatial: { position: [3, 0.5, -2], rotation: [0, 0.25, 0] }
                }
            ],
            edges: [
                { id: 'edge-a', sourceId: 'root-node', targetId: 'cube-1', label: 'color' }
            ]
        })

        expect(document.nodes.map((node) => node.id)).toEqual(['cube-1'])
        const cube = document.nodes[0]
        expect(cube.typeId).toBe('geom.cube')
        expect(cube.values.color).toBe('#33aa66')
        expect(cube.values.size).toEqual([2, 3, 4])
        expect(cube.values.position).toEqual([3, 0.5, -2])
        expect(cube.values.rotation).toEqual([0, 0.25, 0])
        expect(cube.graphX).toBe(120)
        expect(cube.graphY).toBe(80)
        expect(document.edges).toEqual([])
    })

    it('applies createNode / updateNode / deleteNode ops in the new shape', () => {
        const base = normalizeProjectDocument({})
        const afterCreate = applyProjectOps(base, [
            {
                type: 'createNode',
                payload: {
                    node: {
                        id: 'cube-1',
                        typeId: 'geom.cube',
                        label: 'Cube',
                        values: { color: '#33aa66', size: [2, 3, 4] },
                        graphX: 10,
                        graphY: 20
                    }
                }
            }
        ])
        expect(afterCreate.nodes).toHaveLength(1)
        expect(afterCreate.nodes[0].typeId).toBe('geom.cube')

        const afterUpdate = applyProjectOps(afterCreate, [
            {
                type: 'updateNode',
                payload: { nodeId: 'cube-1', patch: { values: { color: '#ff0000' }, graphX: 42 } }
            }
        ])
        expect(afterUpdate.nodes[0].values.color).toBe('#ff0000')
        expect(afterUpdate.nodes[0].values.size).toEqual([2, 3, 4])
        expect(afterUpdate.nodes[0].graphX).toBe(42)

        const afterDelete = applyProjectOps(afterUpdate, [
            { type: 'deleteNode', payload: { nodeId: 'cube-1' } }
        ])
        expect(afterDelete.nodes).toHaveLength(0)
    })

    it('applies createEdge / deleteEdge ops and cascades edge deletion on deleteNode', () => {
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: { id: 'color-1', typeId: 'value.color', values: { value: '#ff0000' } } } },
            { type: 'createNode', payload: { node: { id: 'cube-1', typeId: 'geom.cube', values: {} } } }
        ])
        expect(base.nodes).toHaveLength(2)

        const withEdge = applyProjectOps(base, [
            {
                type: 'createEdge',
                payload: {
                    edge: { id: 'edge-1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }
                }
            }
        ])
        expect(withEdge.edges).toHaveLength(1)
        expect(withEdge.edges[0]).toMatchObject({
            fromNodeId: 'color-1',
            fromPort: 'out',
            toNodeId: 'cube-1',
            toPort: 'color'
        })

        const afterDeleteNode = applyProjectOps(withEdge, [
            { type: 'deleteNode', payload: { nodeId: 'color-1' } }
        ])
        expect(afterDeleteNode.nodes.map((node) => node.id)).toEqual(['cube-1'])
        expect(afterDeleteNode.edges).toHaveLength(0)
    })

    it('rejects unknown typeIds and enforces singleton node types on the client', () => {
        const base = normalizeProjectDocument({})
        const afterUnknown = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'bogus', typeId: 'does.not.exist' } } }
        ])
        expect(afterUnknown.nodes).toHaveLength(0)

        const afterSingleton = applyProjectOps(base, [
            { type: 'createNode', payload: { node: { id: 'light-a', typeId: 'world.light' } } },
            { type: 'createNode', payload: { node: { id: 'light-b', typeId: 'world.light' } } }
        ])
        expect(afterSingleton.nodes).toHaveLength(1)
        expect(afterSingleton.nodes[0].id).toBe('light-a')
    })
})
