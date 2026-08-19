import { describe, expect, it } from 'vitest'
import { STUDIO_INTERIOR, STUDIO_TYPE_ID, buildStudioInterior } from './studioNode.js'
import { createEdge, createNode, getNodeType, listNodeTypes } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from './nodeGraphRuntime.js'

describe('studio container node', () => {
    it('is offered in the palette like any other node type', () => {
        const ids = listNodeTypes({}).map((type) => type.id)
        expect(ids).toContain(STUDIO_TYPE_ID)
    })

    // Load-bearing, not cosmetic — though not for the reason this comment used
    // to give. It claimed graphCardNodes drops every `render === 'panel-2d'`
    // node from the canvas; it does not, it filters on parentId alone, and
    // panel nodes were deliberately re-admitted precisely BECAUSE dropping them
    // made containers impossible. A panel-2d Studio would still be wrong: it
    // would open as a floating window over the very subgraph you entered it to
    // see, the way its own interior panels are seeded hidden to avoid.
    it('renders as a graph card, not a floating window, so it can be entered', () => {
        expect(getNodeType(STUDIO_TYPE_ID).render).toBe('hidden')
    })

    // Was: outputs must be []. computeNodeOutput had no case for anything
    // outside value.*/math.*/time, so any port here returned undefined — but the
    // answer to that was to add the case, not to leave the card unwireable
    // forever. Press-and-pull on a container with no outputs silently drags the
    // card instead of starting a wire.
    //
    // The rule that actually matters is unchanged and now tested directly rather
    // than by proxy: every declared output must produce something through the
    // real runtime. A port that draws a wire and carries nothing is worse than
    // no port, because it persists and survives a reload looking alive.
    it('declares no output the runtime cannot compute', () => {
        const node = createNode(STUDIO_TYPE_ID, { values: { title: 'Rehearsal room' } })
        const context = createNodeGraphContext({ nodes: [node], edges: [] })
        const outputs = getNodeType(STUDIO_TYPE_ID).outputs
        expect(outputs.length).toBeGreaterThan(0)
        for (const port of outputs) {
            expect(
                evaluateNodeOutput(node, port.id, context),
                `${STUDIO_TYPE_ID}.${port.id} draws a wire and carries nothing`
            ).not.toBeUndefined()
        }
    })

    // …and it must carry the WIRED value, not the stale local one. This is the
    // half that a "did something come out" test would miss: the fallthrough at
    // the end of computeNodeOutput returns node.values[portId], which passes
    // that check while silently ignoring every wire into the matching input.
    it('carries a wired Title out, not the value typed on the node', () => {
        const source = createNode('value.string', { id: 'src', values: { value: 'Rehearsal room' } })
        const studio = createNode(STUDIO_TYPE_ID, { id: 'studio-1', values: { title: 'stale' } })
        const edge = createEdge('src', 'out', 'studio-1', 'title')
        const context = createNodeGraphContext({ nodes: [source, studio], edges: [edge] })
        expect(evaluateNodeOutput(studio, 'title', context)).toBe('Rehearsal room')
    })

    it('builds an interior parented to the container', () => {
        const interior = buildStudioInterior({ studioNodeId: 'studio-1' })
        expect(interior.length).toBe(STUDIO_INTERIOR.length)
        for (const node of interior) {
            expect(node.parentId).toBe('studio-1')
        }
    })

    it('builds nothing without a container to parent to', () => {
        expect(buildStudioInterior({ studioNodeId: null })).toEqual([])
    })

    // Every interior panel must have a real body in RawEditor's dispatch chain.
    // Unhandled panel-2d types fall through to a generic text box, which is how
    // the streaming preset's nodes ended up looking like working features.
    it('contains only node types that exist and are palette-creatable', () => {
        const offered = new Set(listNodeTypes({}).map((type) => type.id))
        for (const spec of STUDIO_INTERIOR) {
            expect(getNodeType(spec.typeId), `${spec.typeId} missing from registry`).toBeTruthy()
            expect(offered.has(spec.typeId), `${spec.typeId} not palette-creatable`).toBe(true)
        }
    })

    // Three panels at their default sizes cover a phone screen — entering the
    // Studio node would put its own contents on top of the subgraph you came for.
    it('creates its panels hidden so they do not cover the subgraph', () => {
        const interior = buildStudioInterior({ studioNodeId: 'studio-1' })
        const panels = interior.filter((node) => getNodeType(node.typeId)?.render === 'panel-2d')
        expect(panels.length).toBeGreaterThan(0)
        for (const panel of panels) {
            expect(panel.values.frame.visible).toBe(false)
        }
    })

    it('gives each interior node a distinct position on the canvas', () => {
        const interior = buildStudioInterior({ studioNodeId: 'studio-1' })
        const positions = new Set(interior.map((node) => `${node.graphX},${node.graphY}`))
        expect(positions.size).toBe(interior.length)
    })
})
