// laser-frames.mjs (2026-10-13, N562): the 40 W's MATRIX and the cubes' FAN SWEEP, inside the fields fixtures.json gives
// (both ASSUMED), on the v2.8 matrix rig; and epic-build's --laser-frames patches carry them with the beam's diodes.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FAN_STEPS, MATRIX_N, fanOf, fanSweepFrames, laserFramesOf, matrixFrame, scanFieldOf } from './laser-frames.mjs'
import { dirOfRotation, laserFrameOps, v1Entities } from './epic-build.mjs'
import { laserOf, scanLines, scanLinesAt } from '../../src/objectComponents/laserLine.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const RIG = 'scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json'
const rig = JSON.parse(fs.readFileSync(path.join(repo, RIG), 'utf8'))
const offAxisDeg = (dir) => Math.acos(Math.min(1, -dir[1])) * 180 / Math.PI

describe('laser frames: the numbers come from fixtures.json, labelled ASSUMED', () => {
    it('the cube field ±18.5° and the 40 W taking the cube\'s, both ASSUMED', () => {
        expect(scanFieldOf('ext-lc-ultra-mk2')).toMatchObject({ halfDeg: 18.5, basis: 'ASSUMED' })
        expect(scanFieldOf('up-la40wf')).toMatchObject({ halfDeg: 18.5, basis: 'ASSUMED' })
        expect(scanFieldOf('up-la40wf').note).toMatch(/cube/)
        expect(() => scanFieldOf('up-pl5403')).toThrow()
    })
})

describe('laser frames: the MATRIX', () => {
    it('draws exactly N lines, each a lit point after a blank move, at an equal share', () => {
        for (const n of [1, 4, 9, 12]) {
            const frame = matrixFrame({ n })
            expect(frame).toHaveLength(2 * n)
            const lines = scanLines(frame)
            expect(lines).toHaveLength(n)
            for (const l of lines) expect(l.duty).toBeCloseTo(1 / (2 * n), 12)
            expect(new Set(lines.map((l) => l.dir.map((v) => v.toFixed(6)).join())).size).toBe(n)
        }
    })

    it('stays inside its spread of the field', () => {
        for (const spread of [0.3, 0.6, 1]) {
            const frame = matrixFrame({ n: 16, spread })
            for (const p of frame) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(spread)
            // the corner line is the widest: at most the corner of the field
            for (const l of scanLines(frame)) expect(offAxisDeg(l.dir)).toBeLessThanOrEqual(Math.atan(Math.SQRT2 * Math.tan(18.5 * Math.PI / 180)) * 180 / Math.PI + 1e-9)
        }
    })
})

describe('laser frames: the FAN SWEEP', () => {
    it('one lit line per frame, full duty, swinging ±A over the period', () => {
        const { period, list } = fanSweepFrames({ amplitudeDeg: 6, fieldHalfDeg: 18.5, steps: 48, period: 24 })
        expect(period).toBe(24)
        expect(list).toHaveLength(48)
        const yaw = list.map((f) => { const [l] = scanLines(f); expect(l.duty).toBe(1); return Math.atan2(l.dir[0], -l.dir[1]) * 180 / Math.PI })
        expect(Math.max(...yaw)).toBeCloseTo(6, 3)
        expect(Math.min(...yaw)).toBeCloseTo(-6, 3)
        expect(yaw[0]).toBeCloseTo(0, 9)
    })

    it('the swing is cut to what the field leaves beside the cube\'s widest line', () => {
        const d = (deg) => [Math.sin(deg * Math.PI / 180), 0, Math.cos(deg * Math.PI / 180)]
        const fan = fanOf([d(-15), d(0), d(15)], { wantDeg: 6, fieldHalfDeg: 18.5 })
        expect(fan.widest).toBeCloseTo(15, 6)
        expect(fan.amplitudeDeg).toBeCloseTo(3.5, 6)
        expect(fanOf([d(-20), d(20)], { wantDeg: 6, fieldHalfDeg: 18.5 }).amplitudeDeg).toBe(0)
    })
})

describe('laser frames on the v2.8 matrix rig', () => {
    const { byBeam, units } = laserFramesOf(rig, { dirOf: dirOfRotation })
    const cubes = rig.fixtures.filter((f) => f.type === 'ext-lc-ultra-mk2')
    const forties = rig.fixtures.filter((f) => f.type === 'up-la40wf')

    it('counts: a matrix of N for each 40 W, a sweep on every line of each cube', () => {
        expect(forties).toHaveLength(2)
        expect(cubes).toHaveLength(6)
        expect(units.filter((u) => u.picture === 'matrix')).toHaveLength(2)
        expect(units.filter((u) => u.picture === 'fan sweep')).toHaveLength(6)
        const cubeBeams = cubes.flatMap((f) => f.laser.beams.filter((b) => !b.off))
        expect(byBeam.size).toBe(cubeBeams.length + forties.flatMap((f) => f.laser.beams).length)
        for (const f of forties) for (const b of f.laser.beams) expect(scanLines(byBeam.get(`rig-laser-${b.id}`).frame)).toHaveLength(MATRIX_N)
        for (const b of cubeBeams) expect(byBeam.get(`rig-laser-${b.id}`).frames.list).toHaveLength(FAN_STEPS)
    })

    it('field limits: every cube line, swept, stays inside ±18.5° of its cube\'s axis; every matrix line inside the 40 W\'s', () => {
        for (const u of units) {
            expect(u.reachDeg).toBeLessThanOrEqual(u.field.halfDeg)
            if (u.picture === 'fan sweep') {
                expect(u.amplitudeDeg).toBeGreaterThan(0)
                expect(u.tallestDeg).toBeLessThanOrEqual(u.field.halfDeg)
            }
        }
        for (const [, l] of byBeam) {
            const frames = l.frames ? l.frames.list : [l.frame]
            for (const fr of frames) for (const p of fr) { expect(Math.abs(p[0])).toBeLessThanOrEqual(1); expect(Math.abs(p[1])).toBeLessThanOrEqual(1) }
        }
    })

    it('epic-build --laser-frames: one beam patch each, the beam\'s diodes kept, the frames read back by the renderer by time', () => {
        const doc = { entities: v1Entities(rig) }
        const { ops, unmatched, absent } = laserFrameOps(doc, rig)
        expect(unmatched).toEqual([])
        expect(absent).toEqual([])
        expect(ops).toHaveLength(byBeam.size)
        for (const op of ops) {
            expect(op.type).toBe('updateComponent')
            expect(op.payload.component).toBe('beam')
            expect(Object.keys(op.payload.patch)).toEqual(['laser'])
            expect(op.payload.patch.laser.mW).toHaveLength(3)
            expect(op.payload.patch.laser.fieldHalfDeg).toBe(18.5)
        }
        const swept = laserOf({ laser: ops.find((op) => op.payload.entityId === 'rig-laser-1a').payload.patch.laser })
        const yawAt = (t) => { const [l] = scanLinesAt(swept, t); return Math.atan2(l.dir[0], -l.dir[1]) * 180 / Math.PI }
        expect(yawAt(0.1)).toBeCloseTo(0, 6)
        expect(yawAt(6.1)).toBeCloseTo(6, 3)      // a quarter of the 24 s period
        expect(yawAt(18.1)).toBeCloseTo(-6, 3)
        const matrix = laserOf({ laser: ops.find((op) => op.payload.entityId === 'rig-laser-41').payload.patch.laser })
        expect(matrix.frames).toBe(null)
        expect(scanLinesAt(matrix, 0)).toHaveLength(MATRIX_N)
        expect(scanLinesAt(matrix, 99)).toEqual(scanLinesAt(matrix, 0))
    })
})

describe('the rig\'s own frames win for the 40 W too (2026-10-15, laser-40w)', () => {
    it('a UP-LA40WF beam with frames keeps them instead of the matrix', () => {
        const frames = { period: 12, list: [[[0.1, 0, 1, 1, 1]], [[0, 0, 0, 0, 0]]] }
        const rig = { fixtures: [{ id: 'l1', type: 'up-la40wf', p: [0, 6, 50], laser: { beams: [{ id: '41', r: [1.62, 0, 0], frames }] } }] }
        const { byBeam, units } = laserFramesOf(rig, { dirOf: () => [0, 0, -1] })
        expect(byBeam.get('rig-laser-41').frames).toEqual(frames)
        expect(byBeam.get('rig-laser-41').frame).toBeUndefined()
        expect(units[0].picture).toBe('rig frames')
    })
})
