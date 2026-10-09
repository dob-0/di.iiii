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
