import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { panTiltFromRotation, rotationFromPanTilt, spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import {
    LASER_MIN_HEIGHT_M, RIG_PREFIX, aimAt, beamHitsCrane, buildRig, checkLaser, pickEven, realIndices
} from './rig-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rig = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-2026-10-17.json'), 'utf8'))

// A hall.json of the measured MOXIR shape, written out so the test does not
// need Blender. The numbers are the ones hall.py produced on 2026-09-27.
const hall = {
    geometry: {
        column_grid_z_m: Array.from({ length: 16 }, (_, i) => 45 - 6 * i),
        column_inner_face_x_m: 11.55,
        crane_rail_x_m: 11.25,
        cranes: [
            { z_m: 41, girder_bottom_m: 8.15, girder_top_m: 9.65 },
            { z_m: -25, girder_bottom_m: 8.15, girder_top_m: 9.65 }
        ],
        truss_bottom_m: 11,
        truss_top_centre_m: 13.6,
        runway_bottom_m: 6.538,
        door: { z_m: 45.5 },
        far_wall_z_m: -45.5
    }
}

// aimAt rounds its degrees to 4 places, so the direction agrees to ~1e-6.
const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4))

describe('aiming a lamp at a point', () => {
    it('speaks the same pan/tilt as the inspector, so the beam lands where it was aimed', () => {
        const from = [2, 6, -10]
        for (const to of [[2, 0, -10], [10, 1, 3], [-4, 12, -30], [0, 6, 20]]) {
            const aim = aimAt(from, to)
            const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
            const len = Math.hypot(...d)
            close(spotAimDirection(rotationFromPanTilt(aim)), d.map((c) => c / len))
            const back = panTiltFromRotation(rotationFromPanTilt(aim))
            expect(back.tilt).toBeCloseTo(aim.tilt, 3)
        }
    })

    it('calls straight down tilt 0 and straight up tilt 180', () => {
        expect(aimAt([0, 5, 0], [0, 0, 0]).tilt).toBeCloseTo(0, 6)
        expect(aimAt([0, 0, 0], [0, 5, 0]).tilt).toBeCloseTo(180, 6)
    })
})

describe('the laser rule', () => {
    it('refuses a laser hung low or aimed down, and passes one rising from above head height', () => {
        expect(checkLaser([0, 2, 0], [0, 10, -20])).toMatch(/under/)
        expect(checkLaser([0, 6, 0], [0, 5, -20])).toMatch(/downward/)
        expect(checkLaser([0, LASER_MIN_HEIGHT_M, 0], [0, 10, -20])).toBeNull()
    })
})

describe('beams and the cranes', () => {
    it('sees a beam that runs into a crane girder, and not one that clears it', () => {
        expect(beamHitsCrane([0, 1.6, -40], [0, 12, -15], 60, hall)).toBe(-25)
        expect(beamHitsCrane([0, 1.6, -40], [0, 11, -28.5], 60, hall)).toBeNull()
    })
})

describe('the MOXIR rig', () => {
    const { entities, summary } = buildRig(rig, hall)
    const lamps = entities.filter((e) => e.type === 'spotLight')

    it('hangs every fixture on the list', () => {
        expect(summary.byGroup['beam380-stage'].placed).toBe(8)
        expect(summary.byGroup['beam380-columns'].placed).toBe(10)
        expect(summary.byGroup['bsw250-truss'].placed).toBe(12)
        expect(summary.byGroup['beeeye-front'].placed).toBe(8)
        expect(summary.byGroup['par-columns'].placed + summary.byGroup['par-crane'].placed).toBe(50)
        expect(summary.byGroup['laser-stage'].placed).toBe(2)
        expect(lamps).toHaveLength(90)
        expect(summary.effects).toEqual({ co2: 6, spark: 4, smoke: 4 })
    })

    it('lights the room with the budget only; every other lamp is beam only', () => {
        const real = lamps.filter((e) => !e.components.beam.only)
        expect(real).toHaveLength(8)
        expect(summary.real).toBe(8)
        expect(lamps.every((e) => e.components.beam.visible === true)).toBe(true)
    })

    it('refuses nothing and puts no beam into a crane', () => {
        expect(summary.refused).toEqual([])
        expect(summary.clashes).toEqual([])
    })

    it('marks every entity as the rig\'s and pins it still', () => {
        expect(entities.every((e) => e.id.startsWith(RIG_PREFIX))).toBe(true)
        expect(new Set(entities.map((e) => e.id)).size).toBe(entities.length)
        // Without animation: static, walk mode sets every entity floating and spinning.
        expect(entities.every((e) => e.components.animation?.mode === 'static')).toBe(true)
    })

    it('keeps every lamp inside the hall', () => {
        for (const e of lamps) {
            const [x, y, z] = e.components.transform.position
            expect(Math.abs(x)).toBeLessThan(12)
            expect(y).toBeGreaterThan(0)
            expect(Math.abs(z)).toBeLessThan(45.5)
        }
    })

    it('picks real lamps by the budget\'s rule', () => {
        expect([...realIndices({ id: 'a' }, 12, { realLights: { a: 4 } }, 'budget')]).toEqual(pickEven(4, 12))
        expect([...realIndices({ id: 'a' }, 42, { realLights: { a: { count: 3, pick: 'nearest-stage' } } }, 'budget')]).toEqual([0, 1, 2])
        expect(realIndices({ id: 'a' }, 5, {}, 'all').size).toBe(5)
        expect(realIndices({ id: 'a' }, 5, { realLights: { a: 5 } }, 'none').size).toBe(0)
    })
})

describe('the baked beams (the workaround for a server without beam.only)', async () => {
    const { beamMesh, beamsGlb } = await import('./beams-glb.mjs')
    const { entities } = buildRig(rig, hall)
    const only = entities.filter((e) => e.type === 'spotLight' && e.components.beam.only)

    it('puts every beam-only lamp into one mesh, apex at the lamp, fading along the throw', () => {
        const mesh = beamMesh(only.slice(0, 1))
        const lamp = only[0]
        close(Array.from(mesh.positions.slice(0, 3)), lamp.components.transform.position)
        // Alpha at the mouth is lower than at the lamp.
        const alphaAt = (vertex) => mesh.colors[vertex * 4 + 3]
        expect(alphaAt(mesh.positions.length / 3 - 1)).toBeLessThan(alphaAt(0))
        expect(mesh.indices.length % 3).toBe(0)
    })

    it('writes a GLB', async () => {
        const bytes = await beamsGlb(only)
        expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('glTF')
    })
})
