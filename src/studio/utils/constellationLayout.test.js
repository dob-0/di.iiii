import { describe, it, expect } from 'vitest'
import {
    fitDistance,
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

describe('fitDistance', () => {
    const ring = (n) => layoutSpaces(
        Array.from({ length: n }, (_, i) => ({ id: `s${i}`, isPublic: true, publishedProjectId: 'p' })),
        {}
    )

    it('stands far enough back that the outermost space is inside the frame', () => {
        const nodes = ring(22)
        const distance = fitDistance(nodes, { fov: 55, aspect: 16 / 9 })
        const reach = Math.max(...nodes.map(n => Math.hypot(n.position[0], n.position[1], n.position[2])))
        // The spaces lie on a disc seen from a shallow angle: what has to fit is
        // its WIDTH. Fitting the height leaves the estate a dot in the middle.
        const halfWidthAtOrigin = distance * Math.tan((55 * Math.PI) / 360) * (16 / 9)
        expect(halfWidthAtOrigin).toBeGreaterThan(reach)
    })

    it('does not stand so far back that the estate becomes a cluster', () => {
        const nodes = ring(22)
        const reach = Math.max(...nodes.map(n => Math.hypot(n.position[0], n.position[1], n.position[2])))
        const d = fitDistance(nodes, { fov: 55, aspect: 16 / 9 })
        const halfHeight = d * Math.tan((55 * Math.PI) / 360)
        // On a wide frame the HEIGHT is what binds — the disc is foreshortened
        // to about 0.62 of its width — so that is what "fills the frame" means.
        expect((reach * 0.62) / halfHeight).toBeGreaterThan(0.6)
    })

    it('backs off on a portrait frame instead of cropping the sides', () => {
        const nodes = ring(22)
        expect(fitDistance(nodes, { fov: 55, aspect: 0.62 }))
            .toBeGreaterThan(fitDistance(nodes, { fov: 55, aspect: 16 / 9 }))
    })

    it('backs off as the estate grows, instead of cropping it', () => {
        expect(fitDistance(ring(22))).toBeGreaterThan(fitDistance(ring(6)))
    })

    it('never gets so close that a handful of spaces fill the window', () => {
        expect(fitDistance(ring(1))).toBeGreaterThanOrEqual(12)
        expect(fitDistance([])).toBe(18)
    })

    it('stays inside one frame as the estate grows — sqrt spread, not linear', () => {
        // 22 spaces on the old linear spread reached 31 units; the whole point
        // is that the outer ring stops running away from the middle.
        const reach = Math.max(...ring(22).map(n => Math.hypot(n.position[0], n.position[1], n.position[2])))
        expect(reach).toBeLessThan(18)
    })
})
