import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import RawGraphSurface, { LOD_TIERS, lodTierForZoom } from './RawGraphSurface.jsx'
import { createNode } from '../../project/nodeRegistry.js'

// THE invariant behind semantic zoom.
//
// Wire endpoints are computed from CARD_WIDTH / HEADER_HEIGHT / PORT_ROW_HEIGHT
// and the port index. Level-of-detail rendering is only allowed to change what
// is drawn INSIDE a card's box — never the box, never a port's position. A tier
// that shifted either would detach every wire on that node, and it would read
// as a rendering glitch rather than a bug, which is exactly why it needs a test
// rather than care.
//
// Three independent judges named this as the single highest risk of the
// semantic-zoom work. Do not delete this file.

const makeNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})

// A zoom comfortably inside each tier, so the assertions do not sit on a
// hysteresis boundary.
const ZOOM_IN_TIER = { block: 0.1, header: 0.25, compact: 0.45, full: 1 }

const geometryAtZoom = (nodes, edges, zoom) => {
    const { container, unmount } = render(
        <RawGraphSurface nodes={nodes} edges={edges} initialZoom={zoom} />
    )
    const cards = [...container.querySelectorAll('.raw-graph-node-card')].map((el) => ({
        left: el.style.left,
        top: el.style.top,
        width: el.style.width,
        height: el.style.height
    }))
    // The `d` attribute of every wire encodes both endpoints, so comparing the
    // path strings compares the port centres exactly.
    const wires = [...container.querySelectorAll('svg path')].map((p) => p.getAttribute('d'))
    unmount()
    return { cards, wires }
}

describe('graph geometry is invariant across detail tiers', () => {
    const colorNode = makeNode('value.color', { id: 'color-1', graphX: 0, graphY: 0 })
    const cubeNode = makeNode('geom.cube', { id: 'cube-1', graphX: 320, graphY: 40 })
    const sinNode = makeNode('math.sin', { id: 'sin-1', graphX: 660, graphY: 200 })
    const nodes = [colorNode, cubeNode, sinNode]
    const edges = [
        { id: 'e1', fromNodeId: 'color-1', fromPort: 'out', toNodeId: 'cube-1', toPort: 'color' }
    ]

    it('renders every tier for this fixture (so the comparison is meaningful)', () => {
        for (const tier of LOD_TIERS) {
            expect(lodTierForZoom(ZOOM_IN_TIER[tier])).toBe(tier)
        }
    })

    it('keeps card boxes byte-identical at every tier', () => {
        const reference = geometryAtZoom(nodes, edges, ZOOM_IN_TIER.full).cards
        expect(reference.length).toBe(nodes.length)
        for (const tier of LOD_TIERS) {
            const { cards } = geometryAtZoom(nodes, edges, ZOOM_IN_TIER[tier])
            expect(cards, `card boxes changed at tier "${tier}"`).toEqual(reference)
        }
    })

    it('keeps wire endpoints byte-identical at every tier', () => {
        const reference = geometryAtZoom(nodes, edges, ZOOM_IN_TIER.full).wires
        expect(reference.length).toBeGreaterThan(0)
        for (const tier of LOD_TIERS) {
            const { wires } = geometryAtZoom(nodes, edges, ZOOM_IN_TIER[tier])
            expect(wires, `wire endpoints moved at tier "${tier}"`).toEqual(reference)
        }
    })
})

describe('lodTierForZoom', () => {
    it('drops detail monotonically as zoom falls', () => {
        const order = [1.5, 1, 0.7, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05]
        const ranks = order.map((z) => LOD_TIERS.indexOf(lodTierForZoom(z)))
        for (let i = 1; i < ranks.length; i += 1) {
            expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1])
        }
    })

    it('holds the current tier through a small wobble on a threshold', () => {
        // Pinching to exactly the boundary and jittering must not flicker the
        // markup back and forth.
        const justBelow = LOD_LABELS_BOUNDARY - 0.01
        expect(lodTierForZoom(justBelow, 'full')).toBe('full')
        // …but a decisive move past the band does change tier.
        expect(lodTierForZoom(LOD_LABELS_BOUNDARY - 0.05, 'full')).toBe('compact')
    })
})

// Mirrors the module's LOD_LABELS. Kept local so the test fails loudly if the
// production threshold moves without the test being reconsidered.
const LOD_LABELS_BOUNDARY = 0.62
