import { describe, expect, it } from 'vitest'
import {
    addPointAfterHeld,
    addPointOnOutline,
    closestPointOnSegment,
    cornerFromOutput,
    cornerToOutput,
    isWarpable,
    moveSurfacesOps,
    nearestOutlineSegment,
    nudgePoint,
    outlineOnStage,
    pastedSurface,
    pointFromOutput,
    pointToOutput,
    removePoint,
    surfaceFromClipboardText,
    surfaceToClipboardText,
    surfacesFromClipboardText,
    surfacesToClipboardText
} from './pointEditing.js'
import { pinFunction } from './warpMesh.js'

const near = (point, expected, digits = 5) => {
    expect(point[0]).toBeCloseTo(expected[0], digits)
    expect(point[1]).toBeCloseTo(expected[1], digits)
}

// An unwarped surface covering output 0.1..0.5 both ways, on a 1000x500 stage:
// stage pixels 100..500 x 50..250.
const surface = (points = [], kind = 'video') => ({
    id: 's', source: { kind }, resolution: [200, 100],
    corners: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]],
    points
})
const W = 1000
const H = 500

describe('segments', () => {
    it('measures to the segment, clamped at its ends', () => {
        const hit = closestPointOnSegment([10, 5], [0, 0], [4, 0])
        near(hit.point, [4, 0])
        expect(hit.distance).toBeCloseTo(Math.hypot(6, 5))
    })

    it('finds the piece of outline a stage point is on', () => {
        const outline = outlineOnStage(surface(), W, H)
        const hit = nearestOutlineSegment(outline, [300, 52], 8)
        expect(hit.start.corner).toBe(0)
        expect(hit.end.corner).toBe(1)
        near(hit.point, [300, 50])
    })

    it('is null in open space rather than the nearest edge across the room', () => {
        expect(nearestOutlineSegment(outlineOnStage(surface(), W, H), [700, 400], 8)).toBeNull()
    })
})

describe('adding a point on the outline', () => {
    it('puts it on the side that piece belongs to, halfway along, exactly where the click was', () => {
        const added = addPointOnOutline(surface(), [300, 52], W, H, 8)
        expect(added.index).toBe(0)
        const point = added.points[0]
        expect(point.side).toBe(0)
        expect(point.t).toBeCloseTo(0.5)
        near([point.x, point.y], [0.3, 0.1])
    })

    it('keeps the parameter along the straight side even when that side is already bent', () => {
        const bent = surface([{ side: 0, t: 0.5, x: 0.3, y: 0.2 }])
        const outline = outlineOnStage(bent, W, H)
        const segment = nearestOutlineSegment(outline, [400, 75], 8)
        expect(segment).not.toBeNull()
        const added = addPointOnOutline(bent, segment.point, W, H, 8)
        expect(added.points[1].side).toBe(0)
        expect(added.points[1].t).toBeGreaterThan(0.5)
        expect(added.points[1].t).toBeLessThan(1)
    })

    it('names the bottom and left sides by their own corners', () => {
        const bottom = addPointOnOutline(surface(), [300, 250], W, H, 8)
        expect(bottom.points[0].side).toBe(2)
        const quarter = addPointOnOutline(surface(), [400, 250], W, H, 8)
        expect(quarter.points[0].t).toBeCloseTo(0.25)
        const left = addPointOnOutline(surface(), [100, 150], W, H, 8)
        expect(left.points[0].side).toBe(3)
    })

    it('refuses for a page, which cannot be bent', () => {
        expect(isWarpable('url')).toBe(false)
        expect(isWarpable('project')).toBe(false)
        expect(isWarpable('video')).toBe(true)
        expect(addPointOnOutline(surface([], 'url'), [300, 52], W, H, 8)).toBeNull()
    })

    it('does nothing for a click that is not on the outline', () => {
        expect(addPointOnOutline(surface(), [300, 150], W, H, 8)).toBeNull()
    })
})

describe('the + Point button', () => {
    it('with nothing held, puts a point on the middle of the top edge where the edge already is', () => {
        const added = addPointAfterHeld(surface(), null)
        expect(added.index).toBe(0)
        expect(added.points[0]).toMatchObject({ side: 0, t: 0.5 })
        near([added.points[0].x, added.points[0].y], pinFunction(surface().corners)(0.5, 0))
    })

    it('with a point held, halves the piece after it on the same side', () => {
        const held = surface([{ side: 1, t: 0.5, x: 0.5, y: 0.3 }])
        const added = addPointAfterHeld(held, 0)
        expect(added.points[1]).toMatchObject({ side: 1 })
        expect(added.points[1].t).toBeCloseTo(0.75)
    })

    it('does nothing for a page', () => {
        expect(addPointAfterHeld(surface([], 'project'), null)).toBeNull()
    })
})

describe('moving and taking points', () => {
    const points = [{ side: 0, t: 0.5, x: 0.3, y: 0.1 }, { side: 2, t: 0.5, x: 0.3, y: 0.5 }]

    it('removes the point asked for and nothing else', () => {
        expect(removePoint(points, 0)).toEqual([points[1]])
        expect(removePoint(points, 5)).toBe(points)
    })

    it('nudges by a normalised delta', () => {
        const moved = nudgePoint(points, 1, [0.01, -0.02])
        near([moved[1].x, moved[1].y], [0.31, 0.48])
        expect(moved[0]).toBe(points[0])
    })
})

describe('values written by hand', () => {
    const output = { width: 1920, height: 1080 }

    it('reads a corner in output pixels and writes one back', () => {
        expect(cornerToOutput([0.5, 0.5], output)).toEqual([960, 540])
        near(cornerFromOutput([960, 540], output), [0.5, 0.5])
    })

    it('reads a point in output pixels and writes one back', () => {
        const points = [{ side: 0, t: 0.5, x: 0.25, y: 0.5 }]
        expect(pointToOutput(points[0], output)).toEqual([480, 540])
        const written = pointFromOutput(points, 0, output, [960, 270])
        near([written[0].x, written[0].y], [0.5, 0.25])
        expect(written[0].side).toBe(0)
    })
})

describe('moving a selection', () => {
    it('writes one op per selected surface, carrying the points along, and none for the rest', () => {
        const surfaces = [
            { id: 'a', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], points: [{ side: 0, t: 0.5, x: 0.5, y: 0.1 }] },
            { id: 'b', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], points: [] },
            { id: 'c', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], points: [] }
        ]
        const ops = moveSurfacesOps(surfaces, ['a', 'c'], [0.1, -0.1])
        expect(ops.map((op) => op.payload.surfaceId)).toEqual(['a', 'c'])
        near(ops[0].payload.patch.corners[0], [0.1, -0.1])
        near([ops[0].payload.patch.points[0].x, ops[0].payload.patch.points[0].y], [0.6, 0])
    })
})

describe('the clipboard', () => {
    const a = { id: 'a', name: 'Left paper', corners: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.5], [0.1, 0.5]], points: [{ side: 0, t: 0.5, x: 0.25, y: 0.05 }], opacity: 1 }
    const b = { id: 'b', name: 'B', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], points: [] }

    it('round-trips one surface, and several', () => {
        expect(surfaceFromClipboardText(surfaceToClipboardText(a))).toEqual(a)
        expect(surfacesFromClipboardText(surfacesToClipboardText([a, b]))).toEqual([a, b])
    })

    it('ignores text that is not a surface', () => {
        expect(surfaceFromClipboardText('hello')).toBeNull()
        expect(surfacesFromClipboardText('{"kind":"something else"}')).toEqual([])
        expect(surfacesFromClipboardText(JSON.stringify({ kind: 'di.iiii/mapping-surface', surface: { name: 'no corners' } }))).toEqual([])
    })

    it('pastes as a copy: no id, named as a copy, set a little off, points too', () => {
        const pasted = pastedSurface(a)
        expect(pasted.id).toBeUndefined()
        expect(pasted.name).toBe('Left paper copy')
        near(pasted.corners[0], [0.12, 0.12])
        near([pasted.points[0].x, pasted.points[0].y], [0.27, 0.07])
        expect(pasted.opacity).toBe(1)
    })
})
