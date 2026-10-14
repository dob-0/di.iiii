import { describe, expect, it } from 'vitest'
import {
    chainSegments, clearTraceCache, colourOf, objectPaths, pieceShape, projectPath, traceGeometry, traceCacheSize, FIELD_HALF_DEG,
} from './laserTrace.js'
import { computeOutput as traceOutput } from './runtime.js'
import { computeOutput as mergeOutput } from '../laser.merge/runtime.js'

// Segments a path draws: a closed path of n points draws n, an open one n - 1, a dot 0.
const segments = (paths) => paths.reduce((s, p) => s + (p.p.length / 5 > 1 ? (p.closed ? p.p.length / 5 : p.p.length / 5 - 1) : 0), 0)
const trace = (geometry, options = {}) => traceGeometry(geometry, { size: 0.2, ...options }).frame
const xs = (frame) => frame.paths.flatMap((p) => p.p.filter((_, i) => i % 5 === 0))
const ys = (frame) => frame.paths.flatMap((p) => p.p.filter((_, i) => i % 5 === 1))
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

describe('Laser Trace outline: every kind the descriptor carries', () => {
    it('box: 12 edges as 2 rings and 4 sides', () => {
        const f = trace({ kind: 'box', size: [1, 1, 1], rotation: [0.3, 0.4, 0] })
        expect(segments(f.paths)).toBe(12)
        expect(f.paths.filter((p) => p.closed)).toHaveLength(2)
    })
    it('plane 4, circle 48, line 1', () => {
        expect(segments(trace({ kind: 'plane' }).paths)).toBe(4)
        expect(segments(trace({ kind: 'circle' }).paths)).toBe(48)
        expect(segments(trace({ kind: 'line', from: [0, 0, 0], to: [1, 1, 0] }).paths)).toBe(1)
    })
    it('cylinder: 2 rims and 2 silhouette sides, upright; no sides seen down its axis', () => {
        const upright = trace({ kind: 'cylinder', rotation: [0.2, 0, 0] })
        expect(upright.paths).toHaveLength(4)
        const axial = trace({ kind: 'cylinder', rotation: [Math.PI / 2, 0, 0] })
        expect(axial.paths).toHaveLength(2)
    })
    it('cylinder sides touch the rims at the silhouette (front view: the outermost x)', () => {
        const f = trace({ kind: 'cylinder', radius: 0.5 }, { size: 1 })
        const sides = f.paths.filter((p) => !p.closed)
        expect(sides.map((p) => Math.abs(p.p[0])).every((x) => close(x, 0.5))).toBe(true)
    })
    it('cone: 1 rim and 2 sides from the apex; seen from far below, the rim alone', () => {
        expect(trace({ kind: 'cone' }).paths).toHaveLength(3)
        const below = trace({ kind: 'cone' }, { view: 'point', position: [0, -20, 0.001], aim: [0, 0, 0] })
        expect(below.paths).toHaveLength(1)
    })
    it('sphere: one silhouette ring, its radius the sphere radius in front view', () => {
        const f = trace({ kind: 'sphere', radius: 0.5 }, { size: 1 })
        expect(f.paths).toHaveLength(1)
        expect(Math.max(...xs(f))).toBeCloseTo(0.5, 6)
    })
    it('sphere seen from a point: the ring spans asin(r / d) of the field', () => {
        const f = trace({ kind: 'sphere', radius: 0.5, position: [0, -0.5, 0] }, { view: 'point', position: [0, 0, 5], aim: [0, 0, 0] })
        const half = (FIELD_HALF_DEG * Math.PI) / 180
        expect(Math.max(...xs(f))).toBeCloseTo(Math.asin(0.5 / 5) / half, 2)
    })
    it('torus: outer and inner equator and 4 meridians', () => {
        expect(trace({ kind: 'torus' }).paths).toHaveLength(6)
    })
})

describe('Laser Trace modes: edges, wireframe, points', () => {
    it('edges of a box are its 12 edges; a smooth sphere at 30° has almost none', () => {
        expect(segments(trace({ kind: 'box' }, { mode: 'edges' }).paths)).toBe(12)
        expect(segments(trace({ kind: 'sphere' }, { mode: 'edges' }).paths)).toBeLessThan(10)
    })
    it('wireframe of a box: 12 edges + 6 face diagonals', () => {
        expect(segments(trace({ kind: 'box' }, { mode: 'wireframe' }).paths)).toBe(18)
    })
    it('points of a box: its 8 corners as dots', () => {
        const f = trace({ kind: 'box' }, { mode: 'points' })
        expect(f.paths).toHaveLength(8)
        expect(f.paths.every((p) => p.p.length === 5)).toBe(true)
    })
    it('object-space paths are cached per kind, size and mode', () => {
        clearTraceCache()
        const shape = pieceShape({ kind: 'torus' })
        const a = objectPaths(shape, 'edges', 30)
        expect(objectPaths(shape, 'edges', 30)).toBe(a)
        expect(traceCacheSize()).toBe(1)
        objectPaths(pieceShape({ kind: 'torus', radius: 1 }), 'edges', 30)
        expect(traceCacheSize()).toBe(2)
    })
    it('chains segments that share ends: a square is one closed path, two apart are two', () => {
        const square = [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
        const one = chainSegments(square)
        expect(one).toHaveLength(1)
        expect(one[0].closed).toBe(true)
        expect(chainSegments([0, 0, 0, 1, 0, 0, 5, 5, 5, 6, 5, 5])).toHaveLength(2)
    })
})

describe('Laser Trace transforms, clipping and colour', () => {
    it('group transforms compose as the viewport does (position, scale, and the floor lift)', () => {
        const f = trace({ kind: 'group', position: [2, 0, 0], scale: [2, 2, 2], children: [{ kind: 'box', size: [1, 1, 1] }] }, { size: 0.1 })
        expect(Math.min(...xs(f))).toBeCloseTo(0.1, 6)
        expect(Math.max(...xs(f))).toBeCloseTo(0.3, 6)
        expect(Math.min(...ys(f))).toBeCloseTo(0, 6)
        expect(Math.max(...ys(f))).toBeCloseTo(0.2, 6)
    })
    it('a leaf rotation turns the piece (a quarter turn about z swaps a box\'s width and height)', () => {
        const f = trace({ kind: 'box', size: [2, 0.5, 0.5], rotation: [0, 0, Math.PI / 2] }, { size: 1 })
        expect(Math.max(...xs(f)) - Math.min(...xs(f))).toBeCloseTo(0.5, 6)
    })
    it('fits the shape into 80 % of the field by default, the same under rotation about the origin', () => {
        const a = traceGeometry({ kind: 'box', position: [0, -0.5, 0] }).frame
        const b = traceGeometry({ kind: 'box', position: [0, -0.5, 0], rotation: [0.7, 0.9, 0.2] }).frame
        const reach = (f) => Math.max(...f.paths.flatMap((p) => p.p.filter((_, i) => i % 5 < 2).map(Math.abs)))
        expect(reach(a)).toBeLessThanOrEqual(0.8)
        expect(reach(b)).toBeLessThanOrEqual(0.8)
    })
    it('clips at the field edge and never clamps: the cut line stays on its own line', () => {
        const f = trace({ kind: 'line', from: [-5, -1, 0], to: [5, 1, 0] }, { size: 1 })
        expect(f.paths).toHaveLength(1)
        const p = f.paths[0].p
        expect(Math.abs(p[0])).toBeCloseTo(1, 9)
        for (let i = 0; i < p.length; i += 5) expect(p[i + 1]).toBeCloseTo(p[i] / 5, 9)
        expect(trace({ kind: 'line', from: [3, 3, 0], to: [4, 3, 0] }, { size: 1 }).paths).toHaveLength(0)
    })
    it('clips at the near plane: a shape behind the eye draws nothing', () => {
        const f = trace({ kind: 'box', position: [0, 0, 10] }, { view: 'point', position: [0, 0, 6], aim: [0, 0, 0] })
        expect(f.paths).toHaveLength(0)
    })
    it('a closed ring cut by the field edge becomes open pieces', () => {
        const world = Float64Array.from([-2, 0, 0, 0, 0.5, 0, 2, 0, 0, 0, -0.5, 0])
        const out = projectPath(world, true, { kind: 'front', scale: 1 }, [1, 0, 0])
        expect(out.every((p) => !p.closed)).toBe(true)
        expect(out.every((p) => p.p.every((v, i) => i % 5 > 1 || Math.abs(v) <= 1))).toBe(true)
    })
    it('colour per piece: a merged red box and blue sphere draw red and blue', () => {
        const f = trace({ kind: 'group', children: [{ kind: 'box', color: '#ff0000' }, { kind: 'sphere', color: '#0000ff', position: [2, 0, 0] }] })
        const colours = new Set(f.paths.map((p) => p.p.slice(2, 5).join(',')))
        expect(colours).toEqual(new Set(['1,0,0', '0,0,1']))
    })
    it('a wired colour overrides; level scales; level 0 draws nothing', () => {
        const f = trace({ kind: 'box', color: '#ff0000' }, { colour: '#00ff00', level: 0.5 })
        expect(f.paths.every((p) => p.p[2] === 0 && p.p[3] === 0.5 && p.p[4] === 0)).toBe(true)
        expect(trace({ kind: 'box' }, { level: 0 }).paths).toHaveLength(0)
        expect(colourOf('#abc')).toEqual([0xaa / 255, 0xbb / 255, 0xcc / 255])
    })
    it('returns a v2 laser frame, free order, with its cost', () => {
        const f = trace({ kind: 'box' })
        expect(f).toMatchObject({ kind: 'laser', v: 2, order: 'free', source: 'trace' })
        expect(typeof f.ms).toBe('number')
    })
})

describe('the Laser Trace and Laser Merge nodes', () => {
    const helpers = (values) => ({
        input: (id) => values[id],
        asNumber: (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== null ? Number(v) : d),
        asVec3: (v, d) => (Array.isArray(v) ? v : d),
    })
    it('traces a wired shape; says so when nothing is wired', () => {
        const node = { id: 't1' }
        expect(traceOutput(node, 'frame', helpers({ geometry: { kind: 'box' } })).paths.length).toBeGreaterThan(0)
        expect(traceOutput(node, 'status', helpers({ geometry: { kind: 'box' } }))).toMatch(/^6 paths, \d+ points/)
        expect(traceOutput({ id: 't2' }, 'frame', helpers({}))).toBeUndefined()
        expect(traceOutput({ id: 't2' }, 'status', helpers({}))).toBe('No shape wired in')
    })
    it('merges two traces, and a trace with a legacy Laser frame', () => {
        const a = traceOutput({ id: 'm1' }, 'frame', helpers({ geometry: { kind: 'box' } }))
        const b = traceOutput({ id: 'm2' }, 'frame', helpers({ geometry: { kind: 'circle' } }))
        const merged = mergeOutput({ id: 'm' }, 'frame', helpers({ a, b }))
        expect(merged.paths).toHaveLength(a.paths.length + b.paths.length)
        expect(merged.order).toBe('free')
        const legacy = { kind: 'laser', points: [[0, 0, 1, 0, 0], [0.5, 0, 1, 0, 0]] }
        expect(mergeOutput({ id: 'm' }, 'frame', helpers({ a: legacy })).order).toBe('kept')
        expect(mergeOutput({ id: 'm' }, 'frame', helpers({}))).toBeUndefined()
    })
})
