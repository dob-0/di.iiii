import { describe, expect, it } from 'vitest'
import { STUDIO_INTERIOR, STUDIO_TYPE_ID, buildStudioInterior } from './studioNode.js'
import { getNodeType, listNodeTypes } from '../nodeRegistry.js'

describe('studio container node', () => {
    it('is offered in the palette like any other node type', () => {
        const ids = listNodeTypes({}).map((type) => type.id)
        expect(ids).toContain(STUDIO_TYPE_ID)
    })

    // Load-bearing, not cosmetic: RawEditor's graphCardNodes drops every
    // `render === 'panel-2d'` node from the canvas, so a panel-2d container
    // would be invisible on the graph and could never be entered.
    it('renders as a graph card, not a floating window, so it can be entered', () => {
        expect(getNodeType(STUDIO_TYPE_ID).render).toBe('hidden')
    })

    // computeNodeOutput only has cases for value.*, math.* and time. Declaring a
    // state/signal output here would look complete and always return undefined.
    it('declares no outputs the runtime cannot compute', () => {
        expect(getNodeType(STUDIO_TYPE_ID).outputs).toEqual([])
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
