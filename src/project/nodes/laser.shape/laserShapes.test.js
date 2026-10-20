import { describe, expect, it } from 'vitest'
import { FRAME_MAX_POINTS, normaliseFramePoints } from '../../../shared/laserFrame.js'
import { LASER_SHAPES, generateShape, parseLaserColour } from './laserShapes.js'

describe('parseLaserColour', () => {
    it('reads hex, short hex, and falls back to green', () => {
        expect(parseLaserColour('#ff0000')).toEqual([1, 0, 0])
        expect(parseLaserColour('#0f0')).toEqual([0, 1, 0])
        expect(parseLaserColour('nonsense')).toEqual([0, 1, 64 / 255])
    })
})

describe('generateShape', () => {
    it('makes every named shape a valid frame, with nothing dropped', () => {
        for (const shape of LASER_SHAPES) {
            const points = generateShape({ shape, size: 1, rotation: 0.13, points: 150 })
            expect(points.length, shape).toBeGreaterThan(8)
            expect(normaliseFramePoints(points).dropped, shape).toBe(0)
            expect(points.some((p) => p[2] + p[3] + p[4] > 0), shape).toBe(true)
        }
    })

    it('closes the loops', () => {
        for (const shape of ['circle', 'square', 'triangle', 'star']) {
            const p = generateShape({ shape, size: 1, points: 100 })
            expect(p[0][0]).toBeCloseTo(p[p.length - 1][0], 6)
            expect(p[0][1]).toBeCloseTo(p[p.length - 1][1], 6)
        }
    })

    it('puts blank moves between the fan lines and none in the star', () => {
        const blanks = (shape) => generateShape({ shape, points: 100 }).filter((p) => p[2] + p[3] + p[4] === 0).length
        expect(blanks('fan')).toBe(4)
        expect(blanks('star')).toBe(0)
    })

    it('stays inside -1..1 and the point cap, whatever it is asked', () => {
        const p = generateShape({ shape: 'square', size: 9, rotation: 0.125, points: 1e9 })
        expect(p.length).toBeLessThanOrEqual(FRAME_MAX_POINTS)
        for (const [x, y] of p) { expect(Math.abs(x)).toBeLessThanOrEqual(1); expect(Math.abs(y)).toBeLessThanOrEqual(1) }
    })

    it('scales the colour by level, and level 0 is dark', () => {
        const [, , r, g, b] = generateShape({ colour: '#ff8000', level: 0.5 })[1]
        expect(r).toBeCloseTo(0.5, 5)
        expect(g).toBeCloseTo(0.25, 1)
        expect(b).toBe(0)
        expect(generateShape({ level: 0 }).every((p) => p[2] + p[3] + p[4] === 0)).toBe(true)
    })

    it('turns with rotation, and spin advances it with time', () => {
        const base = generateShape({ shape: 'line', size: 1, points: 8 })
        expect(base[0][0]).toBeCloseTo(-1, 6)
        const quarter = generateShape({ shape: 'line', size: 1, points: 8, rotation: 0.25 })
        expect(quarter[0][0]).toBeCloseTo(0, 6)
        expect(quarter[0][1]).toBeCloseTo(-1, 6)
        const spun = generateShape({ shape: 'line', size: 1, points: 8, spin: 0.25, time: 1 })
        spun.forEach((p, i) => p.forEach((v, j) => expect(v).toBeCloseTo(quarter[i][j], 6)))
    })

    it('size 0 collapses to the centre; an unknown shape is a circle', () => {
        expect(generateShape({ size: 0 }).every((p) => p[0] === 0 && p[1] === 0)).toBe(true)
        expect(generateShape({ shape: 'blob' })).toEqual(generateShape({ shape: 'circle' }))
    })
})

describe('the TouchDesigner scenes (2026-10-17)', () => {
    const blanks = (points) => points.filter((p) => p[2] + p[3] + p[4] === 0).length

    it('galaxy draws `copies` golden spirals, each reached by a blank move, the biggest radius 1', () => {
        const six = generateShape({ shape: 'galaxy', size: 1, points: 300 })
        expect(blanks(six)).toBe(5)
        const two = generateShape({ shape: 'galaxy', size: 1, points: 300, copies: 2 })
        expect(blanks(two)).toBe(1)
        expect(Math.max(...two.map((p) => Math.hypot(p[0], p[1])))).toBeCloseTo(1, 6)
        expect(normaliseFramePoints(six).dropped).toBe(0)
    })

    it('sunflower is one lit line through the seeds along their spiral arms: 13 arms at 120 points, 21 from 300 seeds on, never a dot', () => {
        // every arm crosses the half radius once, out or in: the crossings count the arms
        const arms = (pts) => pts.slice(1).filter((p, i) => (Math.hypot(p[0], p[1]) > 0.5) !== (Math.hypot(pts[i][0], pts[i][1]) > 0.5)).length
        const flower = generateShape({ shape: 'sunflower', size: 1, points: 120 })
        expect(blanks(flower)).toBe(0)
        expect(flower.length).toBe(120)
        expect(arms(flower)).toBe(13)
        for (let i = 1; i < flower.length; i += 1) expect(flower[i].slice(0, 2)).not.toEqual(flower[i - 1].slice(0, 2))
        const radii = flower.map((p) => Math.hypot(p[0], p[1]))
        expect(Math.max(...radii)).toBeGreaterThan(0.95)
        expect(Math.min(...radii)).toBeLessThan(0.1)
        // the points sit evenly along the line: no step longer than a quarter radius, so the guards add none
        const steps = flower.slice(1).map((p, i) => Math.hypot(p[0] - flower[i][0], p[1] - flower[i][1]))
        expect(Math.max(...steps)).toBeLessThan(0.35)
        // more points draw the same line more smoothly: the head keeps at most 300 seeds (21 arms), because a line
        // through more seeds is longer than a cube draws in one frame
        const head = generateShape({ shape: 'sunflower', size: 1, points: 1992 })
        expect(head.length).toBe(1992)
        expect(arms(head)).toBe(21)
        // `copies` picks the nearest Fibonacci number of arms
        expect(arms(generateShape({ shape: 'sunflower', size: 1, points: 120, copies: 10 }))).toBe(8)
    })

    it('noisy is nested rings that change with time and stay inside the circle', () => {
        const a = generateShape({ shape: 'noisy', size: 1, points: 300, time: 0 })
        const b = generateShape({ shape: 'noisy', size: 1, points: 300, time: 2 })
        expect(blanks(a)).toBe(2)
        expect(a).not.toEqual(b)
        expect(Math.max(...a.map((p) => Math.hypot(p[0], p[1])))).toBeLessThanOrEqual(1 + 1e-9)
        expect(blanks(generateShape({ shape: 'noisy', points: 300, copies: 5 }))).toBe(4)
    })

    it('grid is the whole square, the cross and both diagonals: five strokes, corners at ±1', () => {
        const g = generateShape({ shape: 'grid', size: 1, points: 200 })
        expect(blanks(g)).toBe(4)
        const xs = g.map((p) => p[0]), ys = g.map((p) => p[1])
        expect(Math.min(...xs)).toBe(-1); expect(Math.max(...xs)).toBe(1)
        expect(Math.min(...ys)).toBe(-1); expect(Math.max(...ys)).toBe(1)
        expect(g.some((p) => Math.abs(p[0]) < 1e-9 && Math.abs(Math.abs(p[1]) - 0.5) < 0.2)).toBe(true)
    })

    it('rainbow runs the hue along the path, scaled by level, and drifts with time', () => {
        const r = generateShape({ shape: 'circle', points: 120, rainbow: true, level: 0.5 })
        const lit = r.filter((p) => p[2] + p[3] + p[4] > 0)
        expect(new Set(lit.map((p) => p.slice(2).join(','))).size).toBeGreaterThan(20)
        expect(Math.max(...lit.flatMap((p) => p.slice(2)))).toBeCloseTo(0.5, 6)
        expect(generateShape({ shape: 'circle', points: 120, rainbow: true, time: 4 })[1]).not.toEqual(r[1])
    })

    it('a comma list with a cycle plays the shapes in turn; without a cycle the first', () => {
        const list = 'square,circle'
        expect(generateShape({ shape: list, cycle: 2, time: 1 })).toEqual(generateShape({ shape: 'square', time: 1 }))
        expect(generateShape({ shape: list, cycle: 2, time: 3 })).toEqual(generateShape({ shape: 'circle', time: 3 }))
        expect(generateShape({ shape: list, cycle: 2, time: 4.5 })).toEqual(generateShape({ shape: 'square', time: 4.5 }))
        expect(generateShape({ shape: list, time: 3 })).toEqual(generateShape({ shape: 'square', time: 3 }))
    })
})

describe('height', () => {
    it('lifts a shape up the field; at 0.5 a size-0.5 circle sits wholly in the upper half (the keep-in zone)', async () => {
        const { generateShape } = await import('./laserShapes.js')
        const centred = generateShape({ shape: 'circle', size: 0.5 })
        expect(Math.min(...centred.map((p) => p[1]))).toBeLessThan(0)
        const lifted = generateShape({ shape: 'circle', size: 0.5, height: 0.5 })
        expect(Math.min(...lifted.map((p) => p[1]))).toBeGreaterThanOrEqual(-1e-9)
        expect(Math.max(...lifted.map((p) => p[1]))).toBeLessThanOrEqual(1)
    })
})
