import { describe, it, expect } from 'vitest'
import {
    layoutSpaces,
    layoutProjects,
    nodeScale,
    nodeStatus,
    NODE_COLORS,
    NODE_KIND
} from './constellationLayout.js'

const space = (over) => ({ id: 's', label: 'S', isPublic: false, kind: 'normal', publishedProjectId: null, ...over })

describe('nodeStatus', () => {
    it('marks the platform default space as main', () => {
        expect(nodeStatus(space({ id: 'main' }), { defaultSpaceId: 'main' })).toBe('main')
    })
    it('marks a public space with a published project as live', () => {
        expect(nodeStatus(space({ isPublic: true, publishedProjectId: 'p1' }))).toBe('live')
    })
    it('marks a public space without a live project as public', () => {
        expect(nodeStatus(space({ isPublic: true }))).toBe('public')
    })
    it('marks a private space as private', () => {
        expect(nodeStatus(space())).toBe('private')
    })
    it('marks a sandbox as sandbox regardless of visibility', () => {
        expect(nodeStatus(space({ kind: 'sandbox', isPublic: true }))).toBe('sandbox')
    })
    it('main wins over live', () => {
        expect(nodeStatus(space({ id: 'x', isPublic: true, publishedProjectId: 'p' }), { defaultSpaceId: 'x' })).toBe('main')
    })
})

describe('layoutSpaces', () => {
    const spaces = [
        space({ id: 'open' }),
        space({ id: 'a', isPublic: true, publishedProjectId: 'p' }),
        space({ id: 'b' })
    ]

    it('anchors the open space at the center', () => {
        const nodes = layoutSpaces(spaces, { openSpaceId: 'open' })
        const open = nodes.find(n => n.id === 'open')
        expect(open.position[0]).toBeCloseTo(0)
        expect(open.position[2]).toBeCloseTo(0)
        expect(open.kind).toBe(NODE_KIND.OPEN)
    })

    it('gives every node a color matching its status', () => {
        const nodes = layoutSpaces(spaces, { openSpaceId: 'open', defaultSpaceId: 'b' })
        expect(nodes.find(n => n.id === 'a').color).toBe(NODE_COLORS.live)
        expect(nodes.find(n => n.id === 'b').color).toBe(NODE_COLORS.main)
    })

    it('is deterministic — same input, same positions', () => {
        const a = layoutSpaces(spaces, { openSpaceId: 'open' })
        const b = layoutSpaces(spaces, { openSpaceId: 'open' })
        expect(a.map(n => n.position)).toEqual(b.map(n => n.position))
    })

    it('spreads non-center nodes off the origin', () => {
        const nodes = layoutSpaces(spaces, { openSpaceId: 'open' })
        const others = nodes.filter(n => n.id !== 'open')
        others.forEach(n => {
            const r = Math.hypot(n.position[0], n.position[2])
            expect(r).toBeGreaterThan(1)
        })
    })

    it('handles an empty list', () => {
        expect(layoutSpaces([], {})).toEqual([])
    })
})

describe('nodeScale', () => {
    it('grows with project count but stays bounded', () => {
        expect(nodeScale(1)).toBeLessThan(nodeScale(8))
        expect(nodeScale(1000)).toBeCloseTo(nodeScale(14))
    })
    it('handles non-numeric counts', () => {
        expect(nodeScale(undefined)).toBeGreaterThan(0)
    })
})

describe('layoutProjects', () => {
    it('rings the projects around the node position', () => {
        const sats = layoutProjects([{ id: 'p1', title: 'One' }, { id: 'p2', title: 'Two' }], [5, 0, 5], 1)
        expect(sats).toHaveLength(2)
        sats.forEach(s => {
            const dx = s.position[0] - 5
            const dz = s.position[2] - 5
            expect(Math.hypot(dx, dz)).toBeGreaterThan(1)
        })
    })
    it('handles no projects', () => {
        expect(layoutProjects([], [0, 0, 0], 1)).toEqual([])
    })
})
