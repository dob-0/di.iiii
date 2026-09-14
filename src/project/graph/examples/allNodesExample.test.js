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
import { getCardBox } from '../../../raw/utils/cardGeometry.js'

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

    // The 2026-09-14 audit's item 12: Hold.sample and Text.content each
    // carried two wires into the same input, and only the first counted —
    // wrong twice over, since it drew as if BOTH wires worked. Generalised
    // so a future duplicate fails here instead of waiting for a reader to
    // notice a card with two wires landing on one dot.
    it('never wires two edges into the same input', () => {
        const { edges } = example()
        const seen = new Map()
        const duplicates = []
        for (const edge of edges) {
            const key = `${edge.toNodeId}:${edge.toPort}`
            if (seen.has(key)) duplicates.push(key)
            seen.set(key, true)
        }
        expect(duplicates).toEqual([])
    })

    // The other half of item 12: Numbers C and ½ shared one exact (col, row),
    // and so did Work Status/Monitor and Agent Run/the Desk panel — the same
    // grid cell, copy-paste style, not a near-miss. This file's grid (COL
    // 300, ROW 130) is deliberately tight — 95+ cards on one screen — and
    // several of them run taller than one ROW once a live preview is added
    // (cardGeometry.js's TOP_PICTURE_HEIGHT), so a full geometric
    // non-overlap sweep would demand relaying out cards this fix wave never
    // touched, unrelated to item 12. This test holds the narrower, precise
    // claim item 12 actually makes: no two cards in the same scope stand on
    // the exact same spot.
    it('never places two cards at the exact same spot in one scope', () => {
        const { nodes } = example()
        const bySpot = new Map()
        const collisions = []
        for (const node of nodes) {
            const key = `${node.parentId || 'root'}:${node.graphX}:${node.graphY}`
            const earlier = bySpot.get(key)
            if (earlier) collisions.push(`${earlier.id} (${earlier.typeId}) and ${node.id} (${node.typeId}) both at ${key}`)
            else bySpot.set(key, node)
        }
        expect(collisions).toEqual([])
    })

    // A real geometric overlap check DOES hold for the two pairs item 12
    // named directly — proof the fix (moving Number ½ and Work Status/Agent
    // Run to free rows) actually cleared them, with the same box math the
    // graph surface draws from.
    it('clears the two named overlaps with real card geometry, not just position', () => {
        const { nodes } = example()
        const byType = new Map()
        for (const node of nodes) {
            if (!byType.has(node.typeId)) byType.set(node.typeId, [])
            byType.get(node.typeId).push(node)
        }
        const noOverlap = (a, b) => {
            const boxA = getCardBox(a, nodes)
            const boxB = getCardBox(b, nodes)
            return !(boxA.x < boxB.x + boxB.width && boxB.x < boxA.x + boxA.width
                && boxA.y < boxB.y + boxB.height && boxB.y < boxA.y + boxA.height)
        }
        const [numC, numHalf] = byType.get('value.number').filter((n) => n.label?.startsWith('Number C') || n.label?.startsWith('Number ½'))
        expect(noOverlap(numC, numHalf)).toBe(true)
        const [workStatus] = byType.get('work.status')
        const [monitor] = byType.get('stream.monitor')
        expect(noOverlap(workStatus, monitor)).toBe(true)
        const [agentRun] = byType.get('work.agent')
        const [desk] = byType.get('view.desk')
        expect(noOverlap(agentRun, desk)).toBe(true)
    })

    // Item 12's dropped-wire class, at the source rather than the symptom:
    // wire() used to answer null for a key this file never made, and the
    // trailing `.filter(Boolean)` made that invisible to every test that
    // only ever looked at the SURVIVING edges — six wires vanished with no
    // test noticing. wire() now throws instead (see its own comment in
    // allNodesExample.js), so every `it()` in this file that calls
    // `example()` already re-proves the fix on every run: a bad key would
    // throw building the fixture, not disappear into `.filter(Boolean)`.
    // This test states that contract explicitly rather than leaving it
    // implicit in "the file happened not to throw".
    it('resolves every edge to two real nodes (a bad key would have thrown building the fixture)', () => {
        const { edges, nodes } = example()
        const ids = new Set(nodes.map((node) => node.id))
        expect(edges.length).toBeGreaterThan(50)
        for (const edge of edges) {
            expect(ids.has(edge.fromNodeId), `${edge.fromNodeId} (from) is a real node`).toBe(true)
            expect(ids.has(edge.toNodeId), `${edge.toNodeId} (to) is a real node`).toBe(true)
        }
    })
})
