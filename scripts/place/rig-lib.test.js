import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { panTiltFromRotation, rotationFromPanTilt, spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import {
    LASER_MIN_HEIGHT_M, RIG_PREFIX, aimAt, beamHitsCrane, buildRig, candelaAt, checkLaser, classPhotometry, pickEven, realIndices, surfaceHit
} from './rig-lib.mjs'
import { readGeometry } from './fixtures-glb.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rig = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-2026-10-17.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'fixtures.json'), 'utf8'))
// The models as built and committed (fixtures/glb/<kind>.json beside each GLB).
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))

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
        far_wall_z_m: -45.5,
        eave_top_m: 12.17,
        nave_wall_x_m: 12.45,
        wall_inner_x_m: 19.95,
        aisle_roof_m: 8.5,
        lantern_w_m: 12,
        lantern_h_m: 1.9
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
    const { entities, summary } = buildRig(rig, hall, { geometry, manifest })
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
        expect(summary.look).toBe(rig.defaultLook)
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
    const { entities } = buildRig(rig, hall, { geometry, manifest })
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

describe('every look is a design, not a scatter', () => {
    const looks = Object.keys(rig.looks)
    const lampsOf = (look) => buildRig(rig, hall, { geometry, manifest, look })

    it('has the looks the owner asked for, one of them the default', () => {
        expect(looks).toEqual(expect.arrayContaining(['fan-out', 'roof-cathedral', 'crossfire', 'all-to-centre', 'curtain']))
        expect(looks).toContain(rig.defaultLook)
        expect(() => buildRig(rig, hall, { geometry, manifest, look: 'nope' })).toThrow(/no look/)
    })

    for (const look of looks) {
        it(`${look}: refuses nothing, fires nothing into a crane, asks no head past its travel`, () => {
            const { summary } = lampsOf(look)
            expect(summary.refused).toEqual([])
            expect(summary.clashes).toEqual([])
            expect(summary.unreachable).toEqual([])
        })

        it(`${look}: is mirror-symmetric about the centre line — every lamp has a twin, position and beam mirrored`, () => {
            const lamps = lampsOf(look).entities.filter((e) => e.type === 'spotLight')
            const vec = (e) => [...e.components.transform.position, ...spotAimDirection(e.components.transform.rotation)]
            const mirrored = ([x, y, z, dx, dy, dz]) => [-x, y, z, -dx, dy, dz]
            // A twin within 2 cm and 0.01 of direction: float dust is not asymmetry.
            const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02)
            const orphans = lamps.filter((e) => !lamps.some((o) => near(vec(o), mirrored(vec(e))))).map((e) => e.id)
            expect(orphans).toEqual([])
        })
    }

    it('starts every beam at its fixture\'s lens and ends it where it meets the building', () => {
        const { entities, fixtures } = lampsOf(rig.defaultLook)
        const lamps = entities.filter((e) => e.type === 'spotLight')
        expect(fixtures.filter((f) => lamps.some((e) => e.id.endsWith(f.id.replace(/-(\d+)$/, (m, n) => `-${n.padStart(2, '0')}`))))).toHaveLength(lamps.length)
        const classOf = (e) => rig.classes[rig.groups.find((g) => e.id.startsWith(`${RIG_PREFIX}${g.id}-`)).class]
        for (const e of lamps) {
            const from = e.components.transform.position
            const reach = e.components.light.distance
            const d = spotAimDirection(e.components.transform.rotation)
            // The beam ends ON a surface (one step further is outside the room),
            // or at the class's drawing reach if that comes first.
            const hit = surfaceHit(from, d, hall, 200)
            expect(Math.abs(reach - Math.min(hit, classOf(e).reach_m))).toBeLessThan(0.15)
        }
    })

    it('changes the aims between looks and leaves the positions of the fixtures alone', () => {
        const a = lampsOf('fan-out').fixtures
        const b = lampsOf('curtain').fixtures
        const base = (f) => (f.parts.Base || f.parts.Body).elements.slice(12, 15).map((v) => v.toFixed(3)).join(',')
        expect(a.map(base)).toEqual(b.map(base))
        expect(a.map((f) => f.tilt)).not.toEqual(b.map((f) => f.tilt))
    })
})

describe('photometry from the datasheets', () => {
    it('turns lux at a distance into candela by the inverse-square law, and lumens by the beam\'s solid angle', () => {
        expect(candelaAt({ lux: 10000, at_m: 5 }, undefined)).toBe(250000)
        const omega = 2 * Math.PI * (1 - Math.cos((10 * Math.PI / 180) / 2))
        expect(candelaAt({ flux_lm: 1000, beam_deg: 10 }, 10)).toBeCloseTo(1000 / omega, 6)
        // A zoom keeps its flux: twice the angle, about a quarter of the candela.
        expect(candelaAt({ flux_lm: 1000, beam_deg: 10 }, 20) / candelaAt({ flux_lm: 1000, beam_deg: 10 }, 10)).toBeCloseTo(0.25, 1)
    })

    it('keeps the datasheets\' ratios between classes: one exposure number for the whole rig', () => {
        const p = classPhotometry(rig, manifest)
        const withCd = Object.entries(p).filter(([, c]) => c.candela)
        expect(withCd.length).toBeGreaterThanOrEqual(4)
        for (const [, a] of withCd) {
            for (const [, b] of withCd) expect((a.intensity / b.intensity) / (a.candela / b.candela)).toBeCloseTo(1, 4)
        }
        for (const c of Object.values(p)) expect(c.haze).toBeGreaterThan(0)
    })
})
