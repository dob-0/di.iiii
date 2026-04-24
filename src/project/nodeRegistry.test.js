import { describe, expect, it } from 'vitest'
import {
    NODE_TYPES,
    NODE_CATEGORIES,
    PORT_TYPES,
    createNode,
    createEdge,
    listNodeTypes,
    getNodeType,
    getPortType,
    arePortsCompatible,
    getNodeInputs,
    getNodeOutputs,
    resolvePortValue,
} from './nodeRegistry.js'

describe('PORT_TYPES', () => {
    it('defines core port types with label and color', () => {
        for (const key of ['number', 'vec3', 'color', 'boolean', 'string', 'geometry', 'texture', 'signal', 'any']) {
            expect(PORT_TYPES[key]).toHaveProperty('label')
            expect(PORT_TYPES[key]).toHaveProperty('color')
        }
    })
})

describe('NODE_TYPES', () => {
    it('every node type has required fields', () => {
        for (const [id, type] of Object.entries(NODE_TYPES)) {
            expect(type.id).toBe(id)
            expect(type.label).toBeTruthy()
            expect(type.category).toBeTruthy()
            expect(['any', 'web', 'local']).toContain(type.runtime)
            expect(Array.isArray(type.inputs)).toBe(true)
            expect(Array.isArray(type.outputs)).toBe(true)
            expect(['spatial-3d', 'panel-2d', 'hidden']).toContain(type.render)
        }
    })

    it('every port on every node type has id, type, and label', () => {
        for (const type of Object.values(NODE_TYPES)) {
            for (const port of [...type.inputs, ...type.outputs]) {
                expect(port.id).toBeTruthy()
                expect(port.type).toBeTruthy()
                expect(port.label).toBeTruthy()
                expect(PORT_TYPES[port.type] || port.type === 'any').toBeTruthy()
            }
        }
    })

    it('geometry nodes render spatial-3d', () => {
        expect(NODE_TYPES['geom.cube'].render).toBe('spatial-3d')
        expect(NODE_TYPES['geom.sphere'].render).toBe('spatial-3d')
        expect(NODE_TYPES['geom.plane'].render).toBe('spatial-3d')
    })

    it('view nodes render panel-2d', () => {
        expect(NODE_TYPES['view.text'].render).toBe('panel-2d')
        expect(NODE_TYPES['view.browser'].render).toBe('panel-2d')
        expect(NODE_TYPES['view.image'].render).toBe('panel-2d')
    })

    it('world and math nodes are hidden', () => {
        expect(NODE_TYPES['world.light'].render).toBe('hidden')
        expect(NODE_TYPES['world.background'].render).toBe('hidden')
        expect(NODE_TYPES['math.add'].render).toBe('hidden')
    })

    it('singleton nodes are marked', () => {
        expect(NODE_TYPES['world.light'].singleton).toBe(true)
        expect(NODE_TYPES['world.background'].singleton).toBe(true)
        expect(NODE_TYPES['time'].singleton).toBe(true)
        expect(NODE_TYPES['universe.node0'].singleton).toBe(true)
    })

    it('universe.node0 is available as the root seed node', () => {
        const rootType = NODE_TYPES['universe.node0']
        expect(rootType).toBeTruthy()
        expect(rootType.category).toBe('universe')
        expect(rootType.render).toBe('hidden')
        expect(rootType.defaultValues.title).toBe('Node 0')
    })

    it('node.null is the extensibility primitive', () => {
        const nullType = NODE_TYPES['node.null']
        expect(nullType.isNull).toBe(true)
        expect(nullType.inputs).toHaveLength(0)
        expect(nullType.outputs).toHaveLength(0)
        expect(nullType.defaultValues).toHaveProperty('body')
        expect(nullType.defaultValues).toHaveProperty('portDefs')
    })
})

describe('createNode', () => {
    it('creates a node instance with defaults from port definitions', () => {
        const node = createNode('geom.cube')
        expect(node.typeId).toBe('geom.cube')
        expect(typeof node.id).toBe('string')
        expect(node.id.length).toBeGreaterThan(0)
        expect(node.values.color).toBe('#5fa8ff')
        expect(node.values.size).toEqual([1, 1, 1])
        expect(node.values.position).toEqual([0, 0.5, 0])
    })

    it('merges options.values over defaults', () => {
        const node = createNode('geom.cube', { values: { color: '#ff0000' } })
        expect(node.values.color).toBe('#ff0000')
        expect(node.values.size).toEqual([1, 1, 1])
    })

    it('uses options.id when provided', () => {
        const node = createNode('geom.cube', { id: 'my-id' })
        expect(node.id).toBe('my-id')
    })

    it('sets graphX/graphY position', () => {
        const node = createNode('value.number', { graphX: 100, graphY: 200 })
        expect(node.graphX).toBe(100)
        expect(node.graphY).toBe(200)
    })

    it('returns null for unknown typeId', () => {
        expect(createNode('does.not.exist')).toBeNull()
    })

    it('creates a null node with empty body and portDefs', () => {
        const node = createNode('node.null')
        expect(node.typeId).toBe('node.null')
        expect(node.values.body).toBe('')
        expect(node.values.portDefs).toEqual([])
    })

    it('creates universe.node0 with root defaults', () => {
        const node = createNode('universe.node0')
        expect(node.typeId).toBe('universe.node0')
        expect(node.values.title).toBe('Node 0')
        expect(node.values.active).toBe(true)
    })
})

describe('createEdge', () => {
    it('creates an edge between two node ports', () => {
        const edge = createEdge('node-a', 'out', 'node-b', 'color')
        expect(typeof edge.id).toBe('string')
        expect(edge.id.length).toBeGreaterThan(0)
        expect(edge.fromNodeId).toBe('node-a')
        expect(edge.fromPort).toBe('out')
        expect(edge.toNodeId).toBe('node-b')
        expect(edge.toPort).toBe('color')
    })
})

describe('listNodeTypes', () => {
    it('returns all types when no filter given', () => {
        const all = listNodeTypes()
        expect(all.length).toBe(Object.keys(NODE_TYPES).length)
    })

    it('filters by category', () => {
        const geom = listNodeTypes({ category: 'geometry' })
        expect(geom.every(t => t.category === 'geometry')).toBe(true)
        expect(geom.map(t => t.id)).toContain('geom.cube')
    })

    it('filters by query', () => {
        const results = listNodeTypes({ query: 'cube' })
        expect(results.map(t => t.id)).toContain('geom.cube')
        expect(results.map(t => t.id)).not.toContain('geom.sphere')
    })

    it('returns all nodes including web-only when runtime filter is any (no filter)', () => {
        const all = listNodeTypes({ runtime: 'any' })
        expect(all.length).toBe(Object.keys(NODE_TYPES).length)
    })

    it('includes only any+web nodes when runtime is web', () => {
        const web = listNodeTypes({ runtime: 'web' })
        expect(web.map(t => t.id)).toContain('source.ar')
        expect(web.map(t => t.id)).toContain('source.webcam')
        expect(web.map(t => t.id)).toContain('geom.cube') // runtime: 'any' always included
    })

    it('excludes web-only nodes when runtime is local', () => {
        const local = listNodeTypes({ runtime: 'local' })
        expect(local.map(t => t.id)).not.toContain('source.ar')
        expect(local.map(t => t.id)).toContain('geom.cube') // runtime: 'any' always included
    })
})

describe('arePortsCompatible', () => {
    it('same type is compatible', () => {
        expect(arePortsCompatible('number', 'number')).toBe(true)
        expect(arePortsCompatible('color', 'color')).toBe(true)
    })

    it('any connects to everything', () => {
        expect(arePortsCompatible('any', 'number')).toBe(true)
        expect(arePortsCompatible('geometry', 'any')).toBe(true)
    })

    it('color and vec3 are interchangeable', () => {
        expect(arePortsCompatible('color', 'vec3')).toBe(true)
        expect(arePortsCompatible('vec3', 'color')).toBe(true)
    })

    it('incompatible types return false', () => {
        expect(arePortsCompatible('number', 'geometry')).toBe(false)
        expect(arePortsCompatible('string', 'texture')).toBe(false)
    })
})

describe('resolvePortValue', () => {
    it('returns the node local value when no edge', () => {
        const node = createNode('geom.cube', { values: { color: '#ff0000' } })
        expect(resolvePortValue(node, 'color', [], {})).toBe('#ff0000')
    })

    it('returns port default when no local value and no edge', () => {
        const node = createNode('geom.cube')
        node.values = {}
        expect(resolvePortValue(node, 'color', [], {})).toBe('#5fa8ff')
    })

    it('follows an edge to the source node value', () => {
        const colorNode = createNode('value.color', { id: 'color-1', values: { value: '#00ff00', out: '#00ff00' } })
        const cubeNode  = createNode('geom.cube',   { id: 'cube-1'  })
        const edge = createEdge('color-1', 'out', 'cube-1', 'color')

        const resolved = resolvePortValue(cubeNode, 'color', [edge], { 'color-1': colorNode })
        expect(resolved).toBe('#00ff00')
    })
})

describe('getNodeInputs / getNodeOutputs', () => {
    it('returns type-level ports for standard nodes', () => {
        const node = createNode('geom.cube')
        expect(getNodeInputs(node).map(p => p.id)).toContain('color')
        expect(getNodeOutputs(node).map(p => p.id)).toContain('out')
    })

    it('returns instance portDefs for null nodes', () => {
        const node = createNode('node.null', {
            values: {
                body: '',
                portDefs: [
                    { dir: 'in',  id: 'value', type: 'number', label: 'Value' },
                    { dir: 'out', id: 'result', type: 'number', label: 'Result' },
                ]
            }
        })
        expect(getNodeInputs(node).map(p => p.id)).toContain('value')
        expect(getNodeOutputs(node).map(p => p.id)).toContain('result')
    })
})
