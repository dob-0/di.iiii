import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { NODE_RUNTIMES } from './index.js'
import { createEdge, createNode, getNodeType, isNodeTypeImplemented } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from '../graph/nodeGraphRuntime.js'

// Vitest roots at src/ but node resolves from the repo — try both, the same
// dance nodeRegistry.test.js does for its own source scan.
const runtimeSource = readFileSync(
    ['project/graph/nodeGraphRuntime.js', 'src/project/graph/nodeGraphRuntime.js']
        .map((path) => resolve(cwd(), path)).find(existsSync),
    'utf8'
)

describe('NODE_RUNTIMES — the colocated side of the dispatcher', () => {
    it('every colocated type is a real, implemented registry type', () => {
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(getNodeType(typeId), typeId).toBeTruthy()
            expect(isNodeTypeImplemented(typeId), typeId).toBe(true)
        }
    })

    it('no type lives in both the map and the legacy switch', () => {
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(runtimeSource.includes(`case '${typeId}'`), typeId).toBe(false)
        }
    })

    it('no colocated type is marked authoringOnly — same law as the switch', () => {
        // nodeRegistry.test.js extracts evaluated types from the switch's
        // case labels, which is blind to the map — hold the law here for the
        // colocated side.
        for (const typeId of NODE_RUNTIMES.keys()) {
            expect(getNodeType(typeId)?.authoringOnly, typeId).toBeFalsy()
        }
    })
})

const node = (id, typeId, values = {}) => createNode(typeId, { id, values })
const edge = (from, fromPort, to, toPort) => createEdge(from, fromPort, to, toPort)

const evalPort = (doc, nodeId, portId) => {
    const context = createNodeGraphContext(doc)
    const target = doc.nodes.find((n) => n.id === nodeId)
    return evaluateNodeOutput(target, portId, context)
}

describe('logic.compare', () => {
    it('answers all three questions about two wired numbers', () => {
        const doc = {
            nodes: [node('n1', 'value.number', { value: 2 }), node('n2', 'value.number', { value: 5 }), node('c', 'logic.compare')],
            edges: [edge('n1', 'out', 'c', 'a'), edge('n2', 'out', 'c', 'b')]
        }
        expect(evalPort(doc, 'c', 'less')).toBe(true)
        expect(evalPort(doc, 'c', 'equal')).toBe(false)
        expect(evalPort(doc, 'c', 'greater')).toBe(false)
    })

    it('bare, it compares its defaults: 0 equals 0', () => {
        const doc = { nodes: [node('c', 'logic.compare')], edges: [] }
        expect(evalPort(doc, 'c', 'equal')).toBe(true)
        expect(evalPort(doc, 'c', 'less')).toBe(false)
        expect(evalPort(doc, 'c', 'greater')).toBe(false)
    })

    it('equal tolerates float dust', () => {
        const doc = {
            nodes: [node('n1', 'value.number', { value: 0.1 + 0.2 }), node('n2', 'value.number', { value: 0.3 }), node('c', 'logic.compare')],
            edges: [edge('n1', 'out', 'c', 'a'), edge('n2', 'out', 'c', 'b')]
        }
        expect(evalPort(doc, 'c', 'equal')).toBe(true)
    })
})

describe('logic.gate', () => {
    it('open passes the value; closed carries NOTHING, not zero', () => {
        const open = {
            nodes: [node('v', 'value.number', { value: 7 }), node('g', 'logic.gate')],
            edges: [edge('v', 'out', 'g', 'value')]
        }
        expect(evalPort(open, 'g', 'out')).toBe(7)

        const closed = {
            nodes: [node('v', 'value.number', { value: 7 }), node('b', 'value.boolean', { value: false }), node('g', 'logic.gate')],
            edges: [edge('v', 'out', 'g', 'value'), edge('b', 'out', 'g', 'open')]
        }
        expect(evalPort(closed, 'g', 'out')).toBeUndefined()
    })

    it('bare, it is honestly dead — the pass-through contract', () => {
        const doc = { nodes: [node('g', 'logic.gate')], edges: [] }
        expect(evalPort(doc, 'g', 'out')).toBeUndefined()
    })
})

describe('logic.switch', () => {
    it('pick off speaks A, pick on speaks B — any type passes through', () => {
        const doc = {
            nodes: [
                node('ca', 'value.color', { value: '#ff0000' }),
                node('cb', 'value.color', { value: '#0000ff' }),
                node('p', 'value.boolean', { value: true }),
                node('s', 'logic.switch')
            ],
            edges: [edge('ca', 'out', 's', 'a'), edge('cb', 'out', 's', 'b'), edge('p', 'out', 's', 'pick')]
        }
        expect(evalPort(doc, 's', 'out')).toBe('#0000ff')

        const off = { ...doc, edges: doc.edges.slice(0, 2) }
        expect(evalPort(off, 's', 'out')).toBe('#ff0000')
    })

    it('bare, it speaks its A default', () => {
        const doc = { nodes: [node('s', 'logic.switch')], edges: [] }
        expect(evalPort(doc, 's', 'out')).toBe(0)
    })
})
