import { describe, expect, it } from 'vitest'
import { createEdge, createNode, getNodeOutputs, listNodeTypes } from '../nodeRegistry.js'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import { createNodeGraphContext, evaluateNodeInput, evaluateNodeOutput } from './nodeGraphRuntime.js'
import { innerSourcesFor, innerTargetsFor, readInside, wireOps } from './insideReading.js'

const read = (node, document) => readInside(node, {
    allNodes: document.nodes,
    context: createNodeGraphContext(document, { now: 0 }),
    document
})

describe('readInside — IN and OUT as rows', () => {
    it('gives every inspector field a row, with the live value, for every built type', () => {
        for (const type of listNodeTypes()) {
            const node = createNode(type.id)
            if (!node) continue
            const document = { nodes: [node], edges: [] }
            const { inRows, outRows } = read(node, document)
            const ids = inRows.map((row) => row.id)
            expect(new Set(ids).size, `${type.id} has duplicate rows`).toBe(ids.length)
            expect(outRows.map((row) => row.id)).toEqual(getNodeOutputs(node, document.nodes).map((port) => port.id))
            // No row may carry the retired stored-not-run code box.
            expect(ids).not.toContain('__code')
        }
    })

    it('puts the operation menu first and keeps settings that are not ports unwireable', () => {
        const op = createNode('math.op')
        const { inRows } = read(op, { nodes: [op], edges: [] })
        expect(inRows[0].id).toBe('operation')
        expect(inRows[0].isPort).toBe(false)
        const level = createNode('top.level')
        const levelRows = read(level, { nodes: [level], edges: [] }).inRows
        expect(levelRows.find((row) => row.id === 'machine')).toMatchObject({ isPort: false, wired: false })
    })

    it('reads a wired input as its wire: the incoming value, from which card, and that it is disabled', () => {
        const number = createNode('value.number', { label: 'Speed', values: { value: 0.4 } })
        const cube = createNode('geom.cube')
        const document = { nodes: [number, cube], edges: [createEdge(number.id, 'out', cube.id, 'roughness')] }
        const row = read(cube, document).inRows.find((entry) => entry.id === 'roughness')
        expect(row).toMatchObject({ wired: true, origin: 'wire', value: 0.4, fromLabel: 'Speed', fromPortLabel: 'Value', fromInside: false })
        expect(row.field.wired).toBe(true)
        const typed = read(cube, { nodes: [cube], edges: [] }).inRows.find((entry) => entry.id === 'size')
        expect(typed).toMatchObject({ wired: false, fromNode: null, value: [1, 1, 1] })
    })

    it('says where each output goes', () => {
        const lfo = createNode('signal.lfo')
        const cube = createNode('geom.cube', { label: 'Box' })
        const document = { nodes: [lfo, cube], edges: [createEdge(lfo.id, 'sine', cube.id, 'opacity')] }
        const sine = read(lfo, document).outRows.find((row) => row.id === 'sine')
        expect(sine.feeds).toHaveLength(1)
        expect(sine.feeds[0]).toMatchObject({ toLabel: 'Box', toPortLabel: 'Opacity', inside: false })
    })
})

// The owner's custom Cube: a Cube with a node placed INSIDE it, wired into the
// Cube's own input. Edges are not scoped — a wire may join a card to the node
// it stands inside — so this is a document fact and an evaluation fact, and
// both are checked against the real reducer and the real runtime.
describe('wiring across the wall — inner node into its parent', () => {
    const build = () => {
        const cube = createNode('geom.cube', { label: 'Cube' })
        const inner = createNode('value.vec3', { label: 'Big', parentId: cube.id, values: { value: [3, 2, 1] } })
        const knob = createNode('value.number', { label: 'Knob', parentId: cube.id, values: { value: 0.25 } })
        return { cube, inner, knob }
    }

    it('the document keeps an edge from an inner card to its parent input', () => {
        const { cube, inner } = build()
        const base = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createNode', payload: { node: cube } },
            { type: 'createNode', payload: { node: inner } }
        ])
        const edge = createEdge(inner.id, 'out', cube.id, 'size')
        const wired = applyProjectOps(base, wireOps(base.edges, edge))
        expect(wired.edges).toHaveLength(1)
        expect(wired.edges[0]).toMatchObject({ fromNodeId: inner.id, toNodeId: cube.id, toPort: 'size' })
        // Deleting the Cube takes what stands inside it and the wire with it.
        const gone = applyProjectOps(wired, [{ type: 'deleteNode', payload: { nodeId: cube.id } }])
        expect(gone.nodes).toHaveLength(0)
        expect(gone.edges).toHaveLength(0)
    })

    it('evaluation carries the inner value into the parent — the cube IS the size its inside says', () => {
        const { cube, inner } = build()
        const document = { nodes: [cube, inner], edges: [createEdge(inner.id, 'out', cube.id, 'size')] }
        const context = createNodeGraphContext(document, { now: 0 })
        expect(evaluateNodeInput(cube, 'size', context)).toEqual([3, 2, 1])
        expect(evaluateNodeOutput(cube, 'geometry', context).size).toEqual([3, 2, 1])
        const row = read(cube, document).inRows.find((entry) => entry.id === 'size')
        expect(row).toMatchObject({ wired: true, fromInside: true, fromLabel: 'Big', value: [3, 2, 1] })
    })

    it('an inner card can read the parent output, and a loop through the wall carries nothing rather than hanging', () => {
        const { cube, knob } = build()
        const split = createNode('vector.split', { parentId: cube.id })
        const document = {
            nodes: [cube, knob, split],
            edges: [createEdge(cube.id, 'bounds', split.id, 'vector'), createEdge(knob.id, 'out', cube.id, 'roughness')]
        }
        const context = createNodeGraphContext(document, { now: 0 })
        expect(evaluateNodeInput(split, 'vector', context)).toEqual([1, 1, 1])
        expect(evaluateNodeInput(cube, 'roughness', context)).toBe(0.25)
        const bounds = read(cube, document).outRows.find((row) => row.id === 'bounds')
        expect(bounds.feeds[0]).toMatchObject({ inside: true, toNode: expect.objectContaining({ id: split.id }) })
    })

    it('offers only compatible sockets from inside, both ways', () => {
        const { cube, inner, knob } = build()
        const nodes = [cube, inner, knob]
        const intoSize = innerSourcesFor(cube, 'vec3', nodes)
        expect(intoSize.map((c) => c.nodeId)).toEqual([inner.id])
        const intoRoughness = innerSourcesFor(cube, 'number', nodes)
        expect(intoRoughness.map((c) => c.nodeId)).toEqual([knob.id])
        // An outer card is never offered — only what stands inside.
        expect(innerSourcesFor(inner, 'vec3', nodes)).toEqual([])
        const split = createNode('vector.split', { parentId: cube.id })
        const targets = innerTargetsFor(cube, 'vec3', [...nodes, split])
        expect(targets.map((c) => [c.nodeId, c.portId])).toEqual([[split.id, 'vector']])
    })

    it('wiring an input that is already wired replaces the old wire in the same batch', () => {
        const edges = [{ id: 'old', fromNodeId: 'a', fromPort: 'out', toNodeId: 'cube', toPort: 'size' }]
        const ops = wireOps(edges, { id: 'new', fromNodeId: 'b', fromPort: 'out', toNodeId: 'cube', toPort: 'size' })
        expect(ops.map((op) => op.type)).toEqual(['deleteEdge', 'createEdge'])
        expect(ops[0].payload.edgeId).toBe('old')
    })
})
