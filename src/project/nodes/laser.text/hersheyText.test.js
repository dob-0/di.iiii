// Laser Text (laser Phase 9). The glyphs are the generated hersheyRomanSimplex.js (provenance in
// docs/ai/research/laser-phase9-provenance-2026-10-20.md); the strings tested are written here.
import { describe, expect, it } from 'vitest'
import { FRAME_MAX_POINTS, flattenLaserPaths } from '../../../shared/laserFrame.js'
import { createNode } from '../../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from '../../graph/nodeGraphRuntime.js'
import { FIRST_CODE, GLYPHS, HERSHEY_ACKNOWLEDGEMENT, HERSHEY_SOURCE, LAST_CODE } from './hersheyRomanSimplex.js'
import { CAP_HEIGHT, glyphFor, layoutText } from './hersheyText.js'

const allPoints = (frame) => frame.paths.flatMap((p) => Array.from({ length: p.p.length / 5 }, (_, i) => p.p.slice(i * 5, i * 5 + 5)))

describe('the Hershey Roman Simplex data', () => {
    it('holds ASCII 32-126, 95 glyphs, each with its Hershey number', () => {
        expect([FIRST_CODE, LAST_CODE, GLYPHS.length]).toEqual([32, 126, 95])
        expect(GLYPHS.every(([n, body]) => Number.isInteger(n) && body.length % 2 === 0)).toBe(true)
    })
    it('carries the acknowledgements the distribution\'s notice requires, and its source', () => {
        expect(HERSHEY_ACKNOWLEDGEMENT).toMatch(/Dr\. A\. V\. Hershey .* U\. S\. National Bureau of Standards/)
        expect(HERSHEY_ACKNOWLEDGEMENT).toMatch(/James Hurt, Cognition, Inc\./)
        expect(HERSHEY_SOURCE.sha256).toBe('8718fb129c0f6bce89c84fe41bc467e39534d215a6f7c3220cc5789a8a7d8618')
    })
    it('reads glyphs: space has no strokes, A three (glyph 501), I one, 0 one closed loop', () => {
        expect(glyphFor(32)).toMatchObject({ number: 699, strokes: [] })
        const a = glyphFor(65)
        expect(a.number).toBe(501)
        expect(a.strokes).toEqual([[[0, -12], [-8, 9]], [[0, -12], [8, 9]], [[-5, 2], [5, 2]]])
        expect(glyphFor(73).strokes).toHaveLength(1)
        const zero = glyphFor(48).strokes
        expect(zero).toHaveLength(1)
        expect(zero[0][0]).toEqual(zero[0].at(-1))
        expect(glyphFor(31)).toBeNull()
        expect(glyphFor(127)).toBeNull()
    })
})

describe('layoutText', () => {
    it('a capital is `size` tall and the line is centred on x = 0 at `height`', () => {
        const { frame, stats } = layoutText('I', { size: 0.4, height: 0.5 })
        const ys = allPoints(frame).map((p) => p[1])
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.4, 9)
        expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0.5, 9)
        expect(allPoints(frame).every((p) => Math.abs(p[0]) < 1e-9)).toBe(true)
        expect(stats).toMatchObject({ paths: 1, points: 2, missing: 0, fitted: false })
        expect(stats.size).toBeCloseTo(0.4, 9)
    })
    it('draws in the colour at the level, one stroke per glyph stroke, order free', () => {
        const { frame } = layoutText('AH', { colour: '#ff8000', level: 0.5 })
        expect(frame).toMatchObject({ kind: 'laser', v: 2, order: 'free' })
        expect(frame.paths).toHaveLength(6)
        expect(frame.paths[0].p.slice(2, 5).map((v) => Math.round(v * 1000) / 1000)).toEqual([0.5, 0.251, 0])
    })
    it('a character outside ASCII 32-126 is drawn as ? and counted', () => {
        const { stats, frame } = layoutText('é', {})
        expect(stats.missing).toBe(1)
        expect(frame.paths).toHaveLength(glyphFor(63).strokes.length)
    })
    it('two lines sit one LINE_ADVANCE apart, the block centred on `height`', () => {
        const one = layoutText('I', { size: 0.2, height: 0 })
        const two = layoutText('I\nI', { size: 0.2, height: 0 })
        expect(two.frame.paths).toHaveLength(2)
        const top = two.frame.paths[0].p; const bottom = two.frame.paths[1].p
        expect(top[1] - bottom[1]).toBeCloseTo((32 / CAP_HEIGHT) * 0.2, 9)
        expect(one.frame.paths[0].p[1] + one.frame.paths[0].p[6]).toBeCloseTo(0, 9)
    })
    it('text too wide for the field is brought down to fit, never clipped, and says so', () => {
        const { frame, stats } = layoutText('A sentence much too wide for one field', { size: 0.5, height: 0.5 })
        expect(stats.fitted).toBe(true)
        expect(stats.size).toBeLessThan(0.5)
        expect(allPoints(frame).every(([x, y]) => Math.abs(x) <= 0.95 + 1e-9 && Math.abs(y) <= 0.95 + 1e-9)).toBe(true)
    })
    it('descenders and brackets stay in the field near its edge', () => {
        const { frame } = layoutText('(gyp)', { size: 0.5, height: -0.7 })
        expect(allPoints(frame).every(([, y]) => y >= -0.95 - 1e-9 && y <= 0.95 + 1e-9)).toBe(true)
    })
    it(`a long text is held within ${FRAME_MAX_POINTS} vertices and flattens onto the wire`, () => {
        const text = Array.from({ length: 12 }, () => '@@@@@@@@@@@@@@@@@@@@').join('\n')
        const { frame, stats } = layoutText(text, { size: 0.05, height: 0 })
        expect(stats.points).toBeLessThanOrEqual(FRAME_MAX_POINTS)
        expect(stats.cutPoints).toBeGreaterThan(0)
        expect(flattenLaserPaths(frame, { budget: 1000 }).points.length).toBeLessThanOrEqual(1000)
    })
})

describe('the laser.text node', () => {
    const run = (values, port = 'frame') => {
        const node = createNode('laser.text', { id: 'lt', values })
        return evaluateNodeOutput(node, port, createNodeGraphContext({ nodes: [node], edges: [] }))
    }
    it('draws its default word with no wiring, and reports it', () => {
        expect(run({}).paths.length).toBeGreaterThan(0)
        expect(run({}, 'status')).toMatch(/^\d+ strokes, \d+ points$/)
    })
    it('an empty text is an empty path set, not nothing', () => {
        expect(run({ text: '' })).toMatchObject({ kind: 'laser', paths: [] })
    })
})
