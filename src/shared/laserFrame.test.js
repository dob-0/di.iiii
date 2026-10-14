import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './laserFrame.js'

const require = createRequire(import.meta.url)
const server = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../shared/laserFrame.cjs'))

describe('the laser frame (shared/laserFrame.cjs and its browser twin)', () => {
    const cases = [
        [[[0, 0, 1, 0, 0], [2, -3, 0.5, 9, -1]], 'clamped into range'],
        [[{ x: 0.5, y: -0.5, r: 0, g: 1, b: 0 }], 'objects read'],
        [[[0, 0, 1], [NaN, 0, 1, 1, 1], 'x', null], 'bad points dropped'],
        [Array.from({ length: 2005 }, () => [0, 0, 0, 0, 0]), 'capped']
    ]
    it.each(cases)('the twins agree: %#, %s', (input) => {
        expect(browser.normaliseFramePoints(input)).toEqual(server.normaliseFramePoints(input))
    })
    it('agrees on the constants', () => {
        expect(browser.FRAME_MAX_POINTS).toBe(server.FRAME_MAX_POINTS)
        expect(browser.ALL_CUBES).toBe(server.ALL_CUBES)
    })
    it('clamps, drops and caps', () => {
        expect(browser.normaliseFramePoints([[2, -3, 0.5, 9, -1]]).points).toEqual([[1, -1, 0.5, 1, 0]])
        expect(browser.normaliseFramePoints([[0, 0, 1], null]).dropped).toBe(2)
        expect(browser.normaliseFramePoints(Array.from({ length: 2005 }, () => [0, 0, 0, 0, 0]))).toMatchObject({ dropped: 5 })
    })
})

describe('frame v2: paths between laser nodes, flattened at Laser Out', () => {
    const twinTool = () => import('../../scripts/laser/laser-frame-twin.mjs')
    const v2 = (paths, order = 'free') => ({ kind: 'laser', v: 2, order, paths })
    const open = (...pts) => ({ p: pts.flatMap(([x, y]) => [x, y, 1, 0, 0]), closed: false })
    const ring = (cx, cy, r, n = 12) => ({ p: Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n), 0, 1, 0]).flat(), closed: true })
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    const many = (count) => Array.from({ length: count }, () => open([rnd() * 0.9, rnd() * 0.9], [rnd() * 0.9, rnd() * 0.9], [rnd() * 0.9, rnd() * 0.9]))

    it('the browser twin is generated from the .cjs, byte for byte', async () => {
        const fs = await import('node:fs')
        const { buildTwin } = await twinTool()
        const dir = path.dirname(fileURLToPath(import.meta.url))
        expect(fs.readFileSync(path.join(dir, 'laserFrame.js'), 'utf8')).toBe(buildTwin(fs.readFileSync(path.join(dir, '../../shared/laserFrame.cjs'), 'utf8')))
    })
    it('the twins agree on a flatten', () => {
        const frame = v2([...many(10), ring(0, 0.5, 0.3)])
        expect(browser.flattenLaserPaths(frame, { budget: 300, start: [0.2, 0.2] })).toEqual(server.flattenLaserPaths(frame, { budget: 300, start: [0.2, 0.2] }))
    })
    it('a legacy frame splits at its blank points into kept paths', () => {
        const frame = browser.normaliseLaserPaths({ kind: 'laser', points: [[0, 0, 1, 0, 0], [0.5, 0, 1, 0, 0], [0, 0, 0, 0, 0], [0.5, 0.5, 0, 1, 0]] })
        expect(frame.order).toBe('kept')
        expect(frame.paths).toEqual([{ p: [0, 0, 1, 0, 0, 0.5, 0, 1, 0, 0], closed: false }, { p: [0.5, 0.5, 0, 1, 0], closed: false }])
    })
    it('v2 -> wire points -> v2 round-trips (no resample)', () => {
        const paths = [open([0, 0], [0.5, 0]), open([0.1, 0.6], [0.2, 0.7], [0.3, 0.6])]
        const { points } = browser.flattenLaserPaths(v2(paths, 'kept'), { budget: null })
        expect(browser.pathsFromPoints(points)).toEqual(paths)
    })
    it('legacy wire points -> v2 -> wire points keeps every lit point in order', () => {
        const legacy = [[0, 0, 0, 0, 0], [0.1, 0.1, 1, 0, 0], [0.2, 0.1, 1, 0, 0], [0.3, 0.3, 0, 0, 0], [0.3, 0.4, 0, 0, 1]]
        const { points } = browser.flattenLaserPaths({ kind: 'laser', points: legacy }, { budget: null })
        const lit = (list) => list.filter((p) => p[2] + p[3] + p[4] > 0)
        expect(lit(points)).toEqual(lit(legacy))
    })
    it('nearest neighbour never loses a path and enters each at its nearest end', () => {
        const paths = many(60)
        const ordered = browser.orderLaserPaths(paths, [0, 0])
        expect(ordered).toHaveLength(60)
        const key = (p) => [p.slice(0, 2), p.slice(-5, -3)].map((v) => v.join()).sort().join('|')
        expect(ordered.map(key).sort()).toEqual(paths.map((p) => key(p.p)).sort())
        const reversed = browser.orderLaserPaths([open([0.9, 0], [0.5, 0])], [0.4, 0])
        expect(reversed[0].slice(0, 2)).toEqual([0.5, 0])
    })
    it('a closed path is entered at its nearest vertex and closed again', () => {
        const [out] = browser.orderLaserPaths([ring(0, 0, 0.5, 4)], [0, 0.6])
        expect(out.slice(0, 2).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0.5])
        expect(out.slice(-5)).toEqual(out.slice(0, 5))
    })
    it('resamples to exactly the budget, a blank point at each entry; never over 2000 or the cap', () => {
        const frame = v2([...many(20), ring(0, 0, 0.4)])
        for (const budget of [16, 100, 1000, 1999]) {
            const { points, stats } = browser.flattenLaserPaths(frame, { budget })
            expect(points).toHaveLength(budget)
            expect(stats.outPoints).toBe(budget)
        }
        expect(browser.flattenLaserPaths(frame, { budget: 5000 }).points).toHaveLength(2000)
        expect(browser.flattenLaserPaths(frame, { budget: 1000, cap: 700 }).points).toHaveLength(700)
        const { points } = browser.flattenLaserPaths(frame, { budget: 400 })
        expect(points.filter((p) => p[2] + p[3] + p[4] === 0)).toHaveLength(21)
    })
    it('the auto budget is sized from the drawn length', () => {
        const frame = v2([open([-0.5, 0], [0.5, 0])])
        const { points, stats } = browser.flattenLaserPaths(frame, { budget: 0 })
        expect(stats.auto).toBe(true)
        expect(points).toHaveLength(1 + Math.ceil(1 / browser.AUTO_STEP))
        expect(browser.flattenLaserPaths(frame, { budget: 'auto', cap: 50 }).points).toHaveLength(50)
    })
    it('a budget too small for every path drops the shortest and says how many', () => {
        const { points, stats } = browser.flattenLaserPaths(v2(many(20)), { budget: 16 })
        expect(points).toHaveLength(16)
        expect(stats.dropped).toBeGreaterThan(0)
    })
    it('dots stay dots; the budget is shared out among them as dwell', () => {
        const dots = v2([{ p: [0, 0, 1, 1, 1], closed: false }, { p: [0.5, 0.5, 1, 1, 1], closed: false }])
        const { points } = browser.flattenLaserPaths(dots, { budget: 20 })
        expect(points).toHaveLength(20)
        expect(new Set(points.map((p) => `${p[0]},${p[1]}`))).toEqual(new Set(['0,0', '0.5,0.5']))
    })
    it('merges: kept only when every input is kept; nothing in, nothing out', () => {
        expect(browser.mergeLaserPaths([v2([open([0, 0], [1, 0])], 'kept'), { kind: 'laser', points: [[0, 0, 1, 0, 0]] }]).order).toBe('kept')
        expect(browser.mergeLaserPaths([v2([open([0, 0], [1, 0])]), v2([], 'kept')]).order).toBe('free')
        expect(browser.mergeLaserPaths([null, 3])).toBeUndefined()
    })
    it('cleans what it is given: a non-finite point splits the path (no lit line across it), values clamp, a split path is open', () => {
        const frame = browser.normaliseLaserPaths(v2([{ p: [0, 0, 1, 0, 0, NaN, 0, 1, 0, 0, 3, 0, 2, 0, 0], closed: true }]))
        expect(frame.paths).toEqual([{ p: [0, 0, 1, 0, 0], closed: false }, { p: [1, 0, 1, 0, 0], closed: false }])
    })
    it('a bad point between two far points never becomes a lit jump (review of #934, finding 4)', () => {
        const flat = browser.flattenLaserPaths(v2([{ p: [-1, 0.5, 1, 0, 0, NaN, 0, 1, 0, 0, 1, 0.5, 1, 0, 0] }]), { budget: 64 })
        const lit = (q) => q[2] + q[3] + q[4] > 0
        for (let i = 1; i < flat.points.length; i += 1) {
            const [a, b] = [flat.points[i - 1], flat.points[i]]
            if (lit(a) && lit(b)) expect(Math.abs(b[0] - a[0])).toBeLessThan(0.5)
        }
    })
    it('a frame it made is not normalised twice', () => {
        const frame = browser.normaliseLaserPaths(v2([{ p: [0, 0, 1, 0, 0, 0.5, 0, 1, 0, 0] }]))
        expect(browser.normaliseLaserPaths(frame)).toBe(frame)
    })
})
