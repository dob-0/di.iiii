import { describe, expect, it } from 'vitest'
import {
    INERT_INPUTS,
    PASS_THROUGH_PORTS, UNWIRABLE_PORTS,
    buildAllNodesExample,
    paletteTypeIds
} from './allNodesExample.js'
import { createEdge,
    arePortsCompatible,
    createNode,
    getNodeInputs,
    getNodeOutputs,
    getNodeType
} from '../../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeInputs, evaluateNodeOutput } from '../nodeGraphRuntime.js'

const example = () => buildAllNodesExample({ workspaceTop: 64 })

describe('all-nodes example graph', () => {
    // The point of the fixture: if a gated node type gets implemented (its line
    // deleted from UNIMPLEMENTED_NODE_TYPES), the palette grows and this fails
    // until the example covers it too. That is the intended maintenance loop.
    it('instantiates every node type the palette can create', () => {
        const { nodes } = example()
        const covered = new Set(nodes.map((node) => node.typeId))
        const missing = paletteTypeIds().filter((id) => !covered.has(id))
        expect(missing).toEqual([])
    })

    it('creates no node the palette would not offer', () => {
        const { nodes } = example()
        const offered = new Set(paletteTypeIds())
        const extra = [...new Set(nodes.map((n) => n.typeId))].filter((id) => !offered.has(id))
        // The Streaming Prototype preset builds nine unimplemented types by
        // calling createNode directly, which is exactly the trap this guards.
        expect(extra).toEqual([])
    })

    it('only wires port pairs the registry considers compatible', () => {
        const { nodes, edges } = example()
        const byId = new Map(nodes.map((node) => [node.id, node]))
        const mismatches = []
        for (const edge of edges) {
            const from = byId.get(edge.fromNodeId)
            const to = byId.get(edge.toNodeId)
            const fromPort = getNodeOutputs(from).find((p) => p.id === edge.fromPort)
            const toPort = getNodeInputs(to).find((p) => p.id === edge.toPort)
            if (!fromPort || !toPort || !arePortsCompatible(fromPort.type, toPort.type)) {
                mismatches.push(`${from?.typeId}.${edge.fromPort} -> ${to?.typeId}.${edge.toPort}`)
            }
        }
        expect(mismatches).toEqual([])
    })

    it('references only ports that exist on the registry', () => {
        const { nodes, edges } = example()
        const byId = new Map(nodes.map((node) => [node.id, node]))
        const unknown = []
        for (const edge of edges) {
            const from = byId.get(edge.fromNodeId)
            const to = byId.get(edge.toNodeId)
            if (!getNodeOutputs(from).some((p) => p.id === edge.fromPort)) {
                unknown.push(`${from?.typeId}.${edge.fromPort} (output)`)
            }
            if (!getNodeInputs(to).some((p) => p.id === edge.toPort)) {
                unknown.push(`${to?.typeId}.${edge.toPort} (input)`)
            }
        }
        expect(unknown).toEqual([])
    })

    it('wires nothing into a port documented as inert or unwirable', () => {
        const { nodes, edges } = example()
        const byId = new Map(nodes.map((node) => [node.id, node]))
        const banned = new Set([
            ...UNWIRABLE_PORTS.map((entry) => entry.port),
            ...INERT_INPUTS.map((entry) => entry.port)
        ])
        const violations = edges.flatMap((edge) => {
            const from = byId.get(edge.fromNodeId)
            const to = byId.get(edge.toNodeId)
            return [
                `${from?.typeId}.${edge.fromPort}`,
                `${to?.typeId}.${edge.toPort}`
            ].filter((key) => banned.has(key))
        })
        // Wiring a dead port would make the example look more complete than the
        // runtime actually is — the whole reason the old backlog was wrong.
        expect(violations).toEqual([])
    })

    it('documents only ports that really exist', () => {
        const stale = []
        for (const entry of [...UNWIRABLE_PORTS, ...INERT_INPUTS, ...PASS_THROUGH_PORTS]) {
            const lastDot = entry.port.lastIndexOf('.')
            const typeId = entry.port.slice(0, lastDot)
            const portId = entry.port.slice(lastDot + 1)
            const type = getNodeType(typeId)
            const exists = [...(type?.inputs || []), ...(type?.outputs || [])]
                .some((port) => port.id === portId)
            if (!exists) stale.push(entry.port)
        }
        expect(stale).toEqual([])
    })

    // The check that was missing, and whose absence let this file lie for
    // twelve days: the old test only asked whether a port named in
    // UNWIRABLE_PORTS still EXISTED, never whether it was still dead. So when
    // the runtime grew cases for time.beat and geom.cube.bounds and webcam
    // started publishing a live texture, the list stayed green while telling
    // readers that working ports were decoration. Ask the runtime instead.
    it('derives port liveness from the runtime, in both directions', () => {
        const listed = new Set(UNWIRABLE_PORTS.map((entry) => entry.port))
        const passThrough = new Set(PASS_THROUGH_PORTS.map((entry) => entry.port))
        const deadButUnlisted = []
        const listedButAlive = []
        const passThroughButAliveBare = []

        for (const typeId of paletteTypeIds()) {
            const type = getNodeType(typeId)
            for (const port of (type?.outputs || [])) {
                const node = createNode(typeId, { id: `probe-${typeId}` })
                const context = createNodeGraphContext({ nodes: [node], edges: [] })
                const isDead = evaluateNodeOutput(node, port.id, context) === undefined
                const key = `${typeId}.${port.id}`
                if (isDead && !listed.has(key) && !passThrough.has(key)) deadButUnlisted.push(key)
                if (!isDead && listed.has(key)) listedButAlive.push(key)
                // A pass-through port that answers with nothing wired has
                // stopped being pass-through; the list must not overclaim.
                if (!isDead && passThrough.has(key)) passThroughButAliveBare.push(key)
            }
        }

        expect(deadButUnlisted, 'a placeable output carries nothing and is not documented as such').toEqual([])
        expect(listedButAlive, 'documented as unwirable, but the runtime returns a value').toEqual([])
        expect(passThroughButAliveBare, 'documented as pass-through, but alive with nothing wired in').toEqual([])
    })

    // The other direction of the pass-through claim: dead bare is only honest
    // if feeding it brings it alive. One proving fixture per listed port, and
    // an entry without one fails here rather than being taken on trust.
    it('proves every pass-through port alive once fed', () => {
        // A fixture returns the SETUP — the node and its context — and this
        // loop does the evaluation itself, on the port the entry claims. A
        // fixture that returned an evaluated value could prove the wrong
        // thing: the review demonstrated a dead port hiding behind a proof
        // cloned from shape.merge's, green in all three directions.
        const proofs = {
            'shape.merge.out': () => {
                const cube = createNode('geom.cube', { id: 'proof-cube' })
                const merge = createNode('shape.merge', { id: 'proof-merge' })
                const context = createNodeGraphContext({
                    nodes: [cube, merge],
                    edges: [{ id: 'proof-e', fromNodeId: cube.id, fromPort: 'geometry', toNodeId: merge.id, toPort: 'a' }]
                })
                return { node: merge, context }
            },
            // Containment, not a wire: a cube STANDING IN the geo is what
            // brings its Geometry alive.
            'geom.geo.geometry': () => {
                const geo = createNode('geom.geo', { id: 'proof-geo' })
                const cube = createNode('geom.cube', { id: 'proof-geo-cube' })
                cube.parentId = geo.id
                const context = createNodeGraphContext({ nodes: [geo, cube], edges: [] })
                return { node: geo, context }
            },
            // Same law as the Array: fed the cube's shape, the Transform speaks.
            'geom.transform.out': () => {
                const transform = createNode('geom.transform', { id: 'proof-transform' })
                const cube = createNode('geom.cube', { id: 'proof-transform-cube' })
                const context = createNodeGraphContext({
                    nodes: [transform, cube],
                    edges: [createEdge('proof-transform-cube', 'geometry', 'proof-transform', 'geometry')]
                })
                return { node: transform, context }
            },
            // A cube's geometry value fed in is what brings the Array alive.
            'geom.array.out': () => {
                const array = createNode('geom.array', { id: 'proof-array' })
                const cube = createNode('geom.cube', { id: 'proof-array-cube' })
                const context = createNodeGraphContext({
                    nodes: [array, cube],
                    edges: [createEdge('proof-array-cube', 'geometry', 'proof-array', 'geometry')]
                })
                return { node: array, context }
            },
            // Feeding the value is enough — Open defaults true, so the wired
            // gate speaks; the bare-dead half is proven by the main sweep.
            'logic.route.out': () => {
                const gate = createNode('logic.route', { id: 'proof-gate' })
                const number = createNode('value.number', { id: 'proof-gate-number', values: { value: 7 } })
                const context = createNodeGraphContext({
                    nodes: [gate, number],
                    edges: [createEdge('proof-gate-number', 'out', 'proof-gate', 'a')]
                })
                return { node: gate, context }
            }
        }
        for (const entry of PASS_THROUGH_PORTS) {
            const prove = proofs[entry.port]
            expect(prove, `${entry.port} is listed pass-through but has no proving fixture`).toBeTruthy()
            const { node, context } = prove()
            const lastDot = entry.port.lastIndexOf('.')
            expect(node.typeId, `${entry.port}: the fixture proves a different node`).toBe(entry.port.slice(0, lastDot))
            expect(
                evaluateNodeOutput(node, entry.port.slice(lastDot + 1), context),
                `${entry.port} stayed dead even when fed`
            ).toBeDefined()
        }
    })

    // The live part of the graph: the maths chain must actually resolve to
    // numbers at the geometry inputs, not just be connected. A wire that carries
    // undefined looks identical in the editor to one that carries a value.
    it('delivers real computed values to the geometry it drives', () => {
        const { nodes, edges } = example()
        // `now` is milliseconds on a monotonic clock, injected so evaluation
        // stays pure.
        const context = createNodeGraphContext({ nodes, edges }, { now: 2500 })

        const sphere = nodes.find((node) => node.typeId === 'geom.sphere')
        const radius = evaluateNodeInputs(sphere, context).radius
        expect(typeof radius).toBe('number')
        expect(Number.isFinite(radius)).toBe(true)
        // Clamped between Number B (0.5) and Number A (1.5).
        expect(radius).toBeGreaterThanOrEqual(0.5)
        expect(radius).toBeLessThanOrEqual(1.5)

        const cube = nodes.find((node) => node.typeId === 'geom.cube')
        const color = evaluateNodeInputs(cube, context).color
        expect(typeof color).toBe('string')
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)

        const light = nodes.find((node) => node.typeId === 'world.environment')
        const intensity = evaluateNodeInputs(light, context).directionalIntensity
        // Not merely finite: Math.pow of a negative base by a fractional
        // exponent is NaN, which would black the light out without erroring.
        expect(Number.isNaN(intensity)).toBe(false)
        expect(Number.isFinite(intensity)).toBe(true)
        expect(intensity).toBeGreaterThanOrEqual(0)
    })

    it('moves with the clock rather than resolving to a constant', () => {
        const { nodes, edges } = example()
        const sphere = nodes.find((node) => node.typeId === 'geom.sphere')
        const at = (now) => evaluateNodeInputs(
            sphere,
            createNodeGraphContext({ nodes, edges }, { now })
        ).radius
        // Milliseconds. Quarter and three-quarter phase of the sine, so the two
        // samples cannot coincide by symmetry.
        expect(at(400)).not.toBe(at(1900))
    })

    // Panel nodes mount as floating windows immediately. Four of them blanket a
    // 393px phone and the graph behind them cannot be reached at all, so the
    // example creates them hidden and lets the Windows menu open them.
    it('creates panel nodes hidden so they do not blanket a phone screen', () => {
        const { nodes } = example()
        const panels = nodes.filter((node) => getNodeType(node.typeId)?.render === 'panel-2d')
        expect(panels.length).toBeGreaterThan(0)
        for (const panel of panels) {
            expect(panel.values.frame).toBeTruthy()
            expect(typeof panel.values.frame.width).toBe('number')
            expect(panel.values.frame.visible).toBe(false)
        }
    })
})
