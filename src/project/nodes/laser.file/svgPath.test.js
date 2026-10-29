// SVG 2 path data (laser Phase 9). Every path string is written here by hand — self-made fixtures.
import { describe, expect, it } from 'vitest'
import { arcChords, arcEndpointToCentre, arcPoint, flattenPathData, parsePathData } from './svgPath.js'

const segs = (d) => {
    const { segments, error } = parsePathData(d)
    expect(error).toBeNull()
    return segments.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v])))
}

// The largest distance from any sample of a true curve to the polyline.
const distToSegment = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax; const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
const deviation = (points, sample, n = 2000) => {
    let worst = 0
    for (let i = 0; i <= n; i += 1) {
        const [x, y] = sample(i / n)
        let best = Infinity
        for (let k = 1; k < points.length; k += 1) best = Math.min(best, distToSegment(x, y, points[k - 1], points[k]))
        worst = Math.max(worst, best)
    }
    return worst
}
const cubicAt = (p0, p1, p2, p3) => (t) => [0, 1].map((c) => (1 - t) ** 3 * p0[c] + 3 * (1 - t) ** 2 * t * p1[c] + 3 * (1 - t) * t * t * p2[c] + t ** 3 * p3[c])
const quadAt = (p0, p1, p2) => (t) => [0, 1].map((c) => (1 - t) ** 2 * p0[c] + 2 * (1 - t) * t * p1[c] + t * t * p2[c])

describe('SVG path commands, absolute and relative (one test each)', () => {
    it('M: absolute moveto', () => expect(segs('M 10 20')).toEqual([{ type: 'M', x: 10, y: 20 }]))
    it('m: relative moveto — the first m of a path is absolute, a later one is from the current point', () => {
        expect(segs('m 10 20 m 5 5')).toEqual([{ type: 'M', x: 10, y: 20 }, { type: 'M', x: 15, y: 25 }])
    })
    it('M with extra pairs: they are absolute lineto', () => {
        expect(segs('M0 0 10 0 10 10')).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'L', x: 10, y: 10 }])
    })
    it('m with extra pairs: they are relative lineto', () => {
        expect(segs('m1 1 10 0 0 10')).toEqual([{ type: 'M', x: 1, y: 1 }, { type: 'L', x: 11, y: 1 }, { type: 'L', x: 11, y: 11 }])
    })
    it('L: absolute lineto, repeated', () => expect(segs('M0 0 L 3 4 6 8').slice(1)).toEqual([{ type: 'L', x: 3, y: 4 }, { type: 'L', x: 6, y: 8 }]))
    it('l: relative lineto, repeated', () => expect(segs('M1 1 l 3 4 3 4').slice(1)).toEqual([{ type: 'L', x: 4, y: 5 }, { type: 'L', x: 7, y: 9 }]))
    it('H: absolute horizontal', () => expect(segs('M1 2 H 9').slice(1)).toEqual([{ type: 'L', x: 9, y: 2 }]))
    it('h: relative horizontal', () => expect(segs('M1 2 h 9 -2').slice(1)).toEqual([{ type: 'L', x: 10, y: 2 }, { type: 'L', x: 8, y: 2 }]))
    it('V: absolute vertical', () => expect(segs('M1 2 V 9').slice(1)).toEqual([{ type: 'L', x: 1, y: 9 }]))
    it('v: relative vertical', () => expect(segs('M1 2 v 9').slice(1)).toEqual([{ type: 'L', x: 1, y: 11 }]))
    it('C: absolute cubic', () => {
        expect(segs('M0 0 C 1 2 3 4 5 6').slice(1)).toEqual([{ type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }])
    })
    it('c: relative cubic — every point from the segment\'s start', () => {
        expect(segs('M10 10 c 1 2 3 4 5 6').slice(1)).toEqual([{ type: 'C', x1: 11, y1: 12, x2: 13, y2: 14, x: 15, y: 16 }])
    })
    it('S: absolute smooth cubic reflects the previous C\'s second control point', () => {
        expect(segs('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0')[2]).toEqual({ type: 'C', x1: 10, y1: -10, x2: 20, y2: -10, x: 20, y: 0 })
    })
    it('s: relative smooth cubic; with no C before it the first control point is the current point', () => {
        expect(segs('M5 5 s 10 10 20 0')[1]).toEqual({ type: 'C', x1: 5, y1: 5, x2: 15, y2: 15, x: 25, y: 5 })
        expect(segs('M0 0 c 0 10 10 10 10 0 s 10 -10 10 0')[2]).toEqual({ type: 'C', x1: 10, y1: -10, x2: 20, y2: -10, x: 20, y: 0 })
    })
    it('Q: absolute quadratic', () => expect(segs('M0 0 Q 5 10 10 0')[1]).toEqual({ type: 'Q', x1: 5, y1: 10, x: 10, y: 0 }))
    it('q: relative quadratic', () => expect(segs('M2 2 q 5 10 10 0')[1]).toEqual({ type: 'Q', x1: 7, y1: 12, x: 12, y: 2 }))
    it('T: absolute smooth quadratic reflects the previous Q\'s control point; after a non-Q it is the current point', () => {
        expect(segs('M0 0 Q 5 10 10 0 T 20 0')[2]).toEqual({ type: 'Q', x1: 15, y1: -10, x: 20, y: 0 })
        expect(segs('M0 0 L 10 0 T 20 0')[2]).toEqual({ type: 'Q', x1: 10, y1: 0, x: 20, y: 0 })
    })
    it('t: relative smooth quadratic', () => expect(segs('M0 0 q 5 10 10 0 t 10 0')[2]).toEqual({ type: 'Q', x1: 15, y1: -10, x: 20, y: 0 }))
    it('A: absolute arc', () => {
        expect(segs('M0 0 A 5 5 0 0 1 10 0')[1]).toEqual({ type: 'A', rx: 5, ry: 5, phi: 0, large: 0, sweep: 1, x: 10, y: 0 })
    })
    it('a: relative arc, flags written with no separator ("a1 1 0 00 1 1")', () => {
        expect(segs('M3 3 a1 1 0 00 1 1')[1]).toEqual({ type: 'A', rx: 1, ry: 1, phi: 0, large: 0, sweep: 0, x: 4, y: 4 })
        expect(segs('M3 3 a1,1,0,1,1,1,1')[1]).toEqual({ type: 'A', rx: 1, ry: 1, phi: 0, large: 1, sweep: 1, x: 4, y: 4 })
    })
    it('Z: closepath returns to the subpath start and closes the polyline', () => {
        expect(segs('M1 1 L 5 1 L 5 5 Z')[3]).toEqual({ type: 'Z', x: 1, y: 1 })
        const { polylines } = flattenPathData('M1 1 L 5 1 L 5 5 Z')
        expect(polylines).toEqual([{ points: [[1, 1], [5, 1], [5, 5]], closed: true }])
    })
    it('z: lower case is the same; the next command starts from the start point', () => {
        expect(segs('M1 1 l 4 0 z l 0 4')).toEqual([{ type: 'M', x: 1, y: 1 }, { type: 'L', x: 5, y: 1 }, { type: 'Z', x: 1, y: 1 }, { type: 'L', x: 1, y: 5 }])
        const { polylines } = flattenPathData('M1 1 l 4 0 z l 0 4')
        expect(polylines.map((p) => [p.points, p.closed])).toEqual([[[[1, 1], [5, 1]], true], [[[1, 1], [1, 5]], false]])
    })
})

describe('SVG number grammar', () => {
    it('numbers run together: "1.5.5" is 1.5 and .5, "1-2" is 1 and -2, exponents are read', () => {
        expect(segs('M1.5.5L1-2l1e1-1E-1')).toEqual([{ type: 'M', x: 1.5, y: 0.5 }, { type: 'L', x: 1, y: -2 }, { type: 'L', x: 11, y: -2.1 }])
    })
    it('a long path parses in linear time (100 000 linetos well under a second)', () => {
        const d = `M0 0${' l1 1'.repeat(100000)}`
        const t0 = performance.now()
        const { segments, error } = parsePathData(d)
        expect(performance.now() - t0).toBeLessThan(1000)
        expect(error?.reason).toBe('too-many-segments')
        expect(segments).toHaveLength(100000)
    })
})

describe('SVG errors: drawn up to the error, the error named', () => {
    it.each([
        ['not-moveto', 'L 1 1', 0],
        ['missing-arguments', 'M 0 0 L', 1],
        ['bad-number', 'M 0 0 L 1 x', 1],
        ['bad-flag', 'M 0 0 A 1 1 0 2 0 5 5', 1],
        ['unknown-command', 'M 0 0 L 1 1 X 3 3', 2],
        ['unknown-command', 'M 0 0 Z 4 4', 2],
    ])('%s: %s', (reason, d, kept) => {
        const { segments, error } = parsePathData(d)
        expect(error.reason).toBe(reason)
        expect(segments).toHaveLength(kept)
    })
})

describe('SVG flattening holds the stated tolerance', () => {
    const tol = 0.01
    it('a cubic stays within the tolerance of its chords (sampled 2001 times)', () => {
        const { polylines } = flattenPathData('M0 0 C 0 10 10 10 10 0', { tolerance: tol })
        expect(deviation(polylines[0].points, cubicAt([0, 0], [0, 10], [10, 10], [10, 0]))).toBeLessThanOrEqual(tol)
        // and a finer tolerance takes more chords
        const coarse = flattenPathData('M0 0 C 0 10 10 10 10 0', { tolerance: 0.5 }).polylines[0].points.length
        expect(polylines[0].points.length).toBeGreaterThan(coarse)
    })
    it('a quadratic stays within the tolerance', () => {
        const { polylines } = flattenPathData('M0 0 Q 5 20 10 0', { tolerance: tol })
        expect(deviation(polylines[0].points, quadAt([0, 0], [5, 20], [10, 0]))).toBeLessThanOrEqual(tol)
    })
    it('an arc stays within the tolerance; a half circle of r 5 ends where it should', () => {
        const { polylines } = flattenPathData('M0 0 A 5 5 0 0 1 10 0', { tolerance: tol })
        const arc = arcEndpointToCentre(0, 0, 10, 0, 5, 5, 0, 0, 1)
        expect([arc.cx, arc.cy, arc.rx]).toEqual([5, 0, 5])
        expect(Math.abs(arc.dtheta)).toBeCloseTo(Math.PI, 9)
        expect(deviation(polylines[0].points, (t) => arcPoint(arc, arc.theta1 + arc.dtheta * t))).toBeLessThanOrEqual(tol)
        expect(polylines[0].points.at(-1)).toEqual([10, 0])
        expect(polylines[0].points).toHaveLength(arcChords(5, Math.PI, tol) + 1)
    })
    it('a rotated ellipse arc stays within the tolerance', () => {
        const { polylines } = flattenPathData('M0 0 A 8 3 30 1 0 6 4', { tolerance: tol })
        const arc = arcEndpointToCentre(0, 0, 6, 4, 8, 3, 30, 1, 0)
        expect(deviation(polylines[0].points, (t) => arcPoint(arc, arc.theta1 + arc.dtheta * t))).toBeLessThanOrEqual(tol)
    })
})

describe('SVG 2 Appendix B: arc corrections', () => {
    it('B.2.4: the centre form passes through both ends; sweep and large-arc pick the four arcs', () => {
        for (const [large, sweep] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
            const arc = arcEndpointToCentre(1, 2, 7, 5, 6, 4, 20, large, sweep)
            const [sx, sy] = arcPoint(arc, arc.theta1)
            const [ex, ey] = arcPoint(arc, arc.theta1 + arc.dtheta)
            expect([sx, sy, ex, ey].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 2, 7, 5])
            expect(Math.abs(arc.dtheta) > Math.PI).toBe(large === 1)
            expect(arc.dtheta > 0).toBe(sweep === 1)
        }
    })
    it('B.2.5: radii too small are scaled up until the ends fit (a half circle)', () => {
        const arc = arcEndpointToCentre(0, 0, 10, 0, 1, 1, 0, 0, 1)
        expect(arc.rx).toBeCloseTo(5, 9)
        expect(arc.ry).toBeCloseTo(5, 9)
    })
    it('B.2.5: a radius of 0 is a straight line; equal ends draw nothing; negative radii are taken absolute', () => {
        expect(arcEndpointToCentre(0, 0, 10, 0, 0, 5, 0, 0, 1)).toBeNull()
        expect(flattenPathData('M0 0 A 0 5 0 0 1 10 0').polylines[0].points).toEqual([[0, 0], [10, 0]])
        expect(arcEndpointToCentre(3, 3, 3, 3, 5, 5, 0, 0, 1)).toBeNull()
        expect(arcEndpointToCentre(0, 0, 10, 0, -5, -5, 0, 0, 1).rx).toBe(5)
    })
})
