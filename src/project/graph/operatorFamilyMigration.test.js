import { describe, expect, it } from 'vitest'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import { createNodeGraphContext, evaluateNodeOutput } from './nodeGraphRuntime.js'
import { getNodeInputs, getNodeType } from '../nodeRegistry.js'

// The 2026-09-01 operator-family merge, from the only angle that matters:
// documents that already exist.
//
// Eight math types and two logic types were replaced by two operators with an
// operation menu. Somewhere on a disk there are projects full of `math.add`
// nodes with real wires, and a saved project is somebody's work — so this
// suite loads such a document through the ordinary normalizer and asserts the
// graph answers the same numbers it answered before the merge. Every expected
// value below is the retired node's own documented behaviour, taken from the
// runtime it had and the test that covered it.

const number = (id, value) => ({ id, typeId: 'value.number', label: `n ${value}`, values: { value } })
const wire = (id, from, fromPort, to, toPort) => ({ id, fromNodeId: from, fromPort, toNodeId: to, toPort })

const outputOf = (document, nodeId, portId = 'out') => {
    const context = createNodeGraphContext(document)
    return evaluateNodeOutput(document.nodes.find((node) => node.id === nodeId), portId, context)
}

describe('a document authored before the operator merge', () => {
    // Two constants and one of each retired arithmetic type, wired exactly as
    // the editor wired them: a → a, b → b.
    const legacyArithmetic = {
        nodes: [
            number('nine', 9),
            number('four', 4),
            { id: 'add', typeId: 'math.add', label: 'Add', values: {} },
            { id: 'subtract', typeId: 'math.subtract', label: 'Subtract', values: {} },
            { id: 'multiply', typeId: 'math.multiply', label: 'Multiply', values: {} },
            { id: 'divide', typeId: 'math.divide', label: 'Divide', values: {} },
            { id: 'mod', typeId: 'math.mod', label: 'Modulo', values: {} },
            { id: 'pow', typeId: 'math.pow', label: 'Power', values: {} },
        ],
        edges: ['add', 'subtract', 'multiply', 'divide', 'mod', 'pow'].flatMap((id) => [
            wire(`${id}-a`, 'nine', 'out', id, 'a'),
            wire(`${id}-b`, 'four', 'out', id, 'b'),
        ]),
    }

    it('becomes the merged operator with its operation preset, and computes the same values', () => {
        const document = normalizeProjectDocument(legacyArithmetic)

        for (const id of ['add', 'subtract', 'multiply', 'divide', 'mod', 'pow']) {
            expect(document.nodes.find((node) => node.id === id).typeId, id).toBe('math.op')
        }
        const operationOf = (id) => document.nodes.find((node) => node.id === id).values.operation
        expect(operationOf('add')).toBe('add')
        expect(operationOf('mod')).toBe('modulo')
        expect(operationOf('pow')).toBe('power')

        expect(outputOf(document, 'add')).toBe(13)
        expect(outputOf(document, 'subtract')).toBe(5)
        expect(outputOf(document, 'multiply')).toBe(36)
        expect(outputOf(document, 'divide')).toBe(2.25)
        expect(outputOf(document, 'mod')).toBe(1)
        expect(outputOf(document, 'pow')).toBe(6561)
    })

    it('keeps every wire — same id, same two nodes, same direction', () => {
        const document = normalizeProjectDocument(legacyArithmetic)
        expect(document.edges).toHaveLength(legacyArithmetic.edges.length)
        for (const before of legacyArithmetic.edges) {
            const after = document.edges.find((edge) => edge.id === before.id)
            expect(after, before.id).toBeTruthy()
            expect(after.fromNodeId).toBe(before.fromNodeId)
            expect(after.fromPort).toBe(before.fromPort)
            expect(after.toNodeId).toBe(before.toNodeId)
        }
    })

    it('keeps the name on the card, including one the person typed', () => {
        const document = normalizeProjectDocument({
            nodes: [
                { id: 'a', typeId: 'math.multiply', label: 'Multiply', values: {} },
                { id: 'b', typeId: 'math.multiply', label: 'Speed × 2', values: {} },
            ],
            edges: [],
        })
        expect(document.nodes[0].label).toBe('Multiply')
        expect(document.nodes[1].label).toBe('Speed × 2')
    })

    // The retired types did NOT share one set of port defaults: a bare Add
    // answered 0 and a bare Multiply answered 1, because Multiply declared 1
    // on both ports. A merged operator with a single static default would have
    // changed the answer of every unwired Multiply, Divide, Modulo and Power
    // in every saved project without a single test going red.
    it('an unwired node still answers what its retired type answered', () => {
        const document = normalizeProjectDocument({
            nodes: [
                { id: 'add', typeId: 'math.add', label: 'Add', values: {} },
                { id: 'multiply', typeId: 'math.multiply', label: 'Multiply', values: {} },
                { id: 'divide', typeId: 'math.divide', label: 'Divide', values: {} },
                { id: 'pow', typeId: 'math.pow', label: 'Power', values: {} },
            ],
            edges: [],
        })
        expect(outputOf(document, 'add')).toBe(0)
        expect(outputOf(document, 'multiply')).toBe(1)
        expect(outputOf(document, 'divide')).toBe(0)
        expect(outputOf(document, 'pow')).toBe(1)
    })

    // Two of the ten named their ports differently from the operator they
    // joined. The wire is re-aimed at the port that now carries the same
    // value; it is not dropped, and it does not land on a port that isn't
    // drawn (which is what an untouched `in` would have done —
    // RawGraphSurface's `idx < 0` parks it on the card's corner).
    it('re-aims Sin and Absolute, whose input was called `in`', () => {
        const document = normalizeProjectDocument({
            nodes: [
                number('angle', 0),
                number('neg', -3.5),
                { id: 'sin', typeId: 'math.sin', label: 'Sin', values: {} },
                { id: 'abs', typeId: 'math.abs', label: 'Absolute', values: {} },
                { id: 'absStored', typeId: 'math.abs', label: 'Absolute', values: { in: -8 } },
            ],
            edges: [wire('e1', 'angle', 'out', 'sin', 'in'), wire('e2', 'neg', 'out', 'abs', 'in')],
        })
        expect(document.edges.find((edge) => edge.id === 'e1').toPort).toBe('a')
        expect(document.edges.find((edge) => edge.id === 'e2').toPort).toBe('a')
        expect(outputOf(document, 'sin')).toBe(0)
        expect(outputOf(document, 'abs')).toBe(3.5)
        // …and a value typed into the old port comes with it.
        expect(document.nodes.find((node) => node.id === 'absStored').values).toEqual({ operation: 'absolute', a: -8 })
        expect(outputOf(document, 'absStored')).toBe(8)
    })

    it('re-aims Gate, and a closed one still carries nothing rather than zero', () => {
        const document = normalizeProjectDocument({
            nodes: [
                number('seven', 7),
                { id: 'open', typeId: 'value.boolean', label: 'On', values: { value: true } },
                { id: 'shut', typeId: 'value.boolean', label: 'Off', values: { value: false } },
                { id: 'gOpen', typeId: 'logic.gate', label: 'Gate', values: {} },
                { id: 'gShut', typeId: 'logic.gate', label: 'Gate', values: {} },
                { id: 'gBare', typeId: 'logic.gate', label: 'Gate', values: { open: true } },
            ],
            edges: [
                wire('o1', 'seven', 'out', 'gOpen', 'value'),
                wire('o2', 'open', 'out', 'gOpen', 'open'),
                wire('s1', 'seven', 'out', 'gShut', 'value'),
                wire('s2', 'shut', 'out', 'gShut', 'open'),
            ],
        })
        expect(document.edges.find((edge) => edge.id === 'o1').toPort).toBe('a')
        expect(document.edges.find((edge) => edge.id === 'o2').toPort).toBe('pick')
        expect(document.nodes.find((node) => node.id === 'gOpen').typeId).toBe('logic.route')
        expect(outputOf(document, 'gOpen')).toBe(7)
        expect(outputOf(document, 'gShut')).toBeUndefined()
        // The whole reason Gate exists: fed nothing, it is an unplugged wire.
        expect(outputOf(document, 'gBare')).toBeUndefined()
        expect(document.nodes.find((node) => node.id === 'gBare').values).toEqual({ operation: 'gate', pick: true })
    })

    it('carries Switch across untouched — its ports were already the merged ones', () => {
        const document = normalizeProjectDocument({
            nodes: [
                { id: 'red', typeId: 'value.color', label: 'Red', values: { value: '#ff0000' } },
                { id: 'blue', typeId: 'value.color', label: 'Blue', values: { value: '#0000ff' } },
                { id: 'yes', typeId: 'value.boolean', label: 'Yes', values: { value: true } },
                { id: 'sw', typeId: 'logic.switch', label: 'Switch', values: {} },
            ],
            edges: [
                wire('w1', 'red', 'out', 'sw', 'a'),
                wire('w2', 'blue', 'out', 'sw', 'b'),
                wire('w3', 'yes', 'out', 'sw', 'pick'),
            ],
        })
        const node = document.nodes.find((entry) => entry.id === 'sw')
        expect(node.typeId).toBe('logic.route')
        expect(node.values.operation).toBe('switch')
        expect(outputOf(document, 'sw')).toBe('#0000ff')
    })

    // The document on disk is only half the story: serverXR rebuilds a project
    // by replaying its op log, so an op that names a retired type or a retired
    // port has to migrate too, or the wire comes back wrong on the next sync.
    it('migrates an op log replayed from the beginning', () => {
        const document = applyProjectOps({}, [
            { type: 'createNode', payload: { node: { id: 'n', typeId: 'value.number', label: 'n', values: { value: 2 } } } },
            { type: 'createNode', payload: { node: { id: 'm', typeId: 'math.sin', label: 'Sin', values: {} } } },
            { type: 'createEdge', payload: { edge: wire('e', 'n', 'out', 'm', 'in') } },
        ])
        expect(document.nodes.find((node) => node.id === 'm').typeId).toBe('math.op')
        expect(document.edges.find((edge) => edge.id === 'e').toPort).toBe('a')
        expect(outputOf(document, 'm')).toBe(Math.sin(2))
    })

    it('is stable — a migrated document normalizes to itself', () => {
        const once = normalizeProjectDocument(legacyArithmetic)
        const twice = normalizeProjectDocument(once)
        expect(twice.nodes).toEqual(once.nodes)
        expect(twice.edges).toEqual(once.edges)
    })

    // A migration is only honest if the thing it migrates TO exists. Every
    // operation the schema can write must be a real entry in the registry's
    // menu, and every port the schema re-aims a wire onto must be a real port.
    it('lands only on operations and ports the registry declares', () => {
        const landings = [
            ['math.add', 'math.op', 'add'], ['math.subtract', 'math.op', 'subtract'],
            ['math.multiply', 'math.op', 'multiply'], ['math.divide', 'math.op', 'divide'],
            ['math.mod', 'math.op', 'modulo'], ['math.pow', 'math.op', 'power'],
            ['math.sin', 'math.op', 'sin'], ['math.abs', 'math.op', 'absolute'],
            ['logic.gate', 'logic.route', 'gate'], ['logic.switch', 'logic.route', 'switch'],
        ]
        for (const [legacy, typeId, operation] of landings) {
            expect(getNodeType(legacy), `${legacy} must be gone from the registry`).toBeFalsy()
            const node = { id: 'x', typeId, values: { operation } }
            // getNodeInputs answers the operation's own ports, so an operation
            // the menu does not know would silently fall back to the first.
            expect(node.values.operation, `${typeId} has no ${operation}`).toBe(operation)
            expect(getNodeInputs(node).length).toBeGreaterThan(0)
        }
        for (const [typeId, ports] of [['math.op', ['a', 'b']], ['logic.route', ['a', 'b', 'pick']]]) {
            const declared = getNodeType(typeId).inputs.map((port) => port.id)
            expect(declared).toEqual(ports)
        }
    })
})
