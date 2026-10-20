// @vitest-environment node
// Light footprints (owner, 2026-09-30: "simulate the light sizes ... to see the real result"): the formulas
// on known geometry, the ray against a small synthetic hall, the flags and the basis, and the two ground
// versions' real files held to rig-lib's own `surfaceHit`. Pure math: no browser, nothing written.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { surfaceHit } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { loadLibrary } from './library.mjs'
import { VERSIONS_FILE, rigFileOf } from './versions.mjs'
import {
    THRESHOLDS, analyse, castRay, cosIncidence, ellipseMajor, eulerXYZ, flagsOf, footprint, hallSolids, illuminance, makeBuilding, rayBox, rayObb, spotDiameter, toCsv, wordsFor
} from './footprints.mjs'

const DEG = Math.PI / 180
const unitOf = (v) => {
    const l = Math.hypot(...v)
    return v.map((c) => c / l)
}
// a small hall: floor, roof deck at 12 m with one lantern opening (up to 14.7 m), walls at x +-20, z -30 / 30
const hall = {
    dims: { column_w_m: 0.5 },
    geometry: {
        roof_flat: true, deck_m: 12, lantern_top_m: 15, lanterns: [{ x_m: [-2, 2], z_m: [-2, 2] }], walls_x_m: [-20, 20], far_wall_z_m: -30, door: { z_m: 30 },
        massing: [{ id: 'press', x_m: [5, 6], y_m: [0, 3], z_m: [-1, 1] }], column_grid_z_m: [10], column_row_x_m: [-12, 12], column_inner_face_x_m: 11.6, rows_x_m: [-12, 12], cranes: []
    }
}
const building = makeBuilding(hall)
const solids = hallSolids(hall)
const optics = { beam_deg: 20, zoom_deg: null, lux: 1000, at_m: 10, photometrySrc: 'TEST', photometryBasis: 'EQUIVALENT' }
const down = (extra = {}) => footprint({ from: [0, 10, 5], dir: [0, -1, 0], maxReach: 30, building, solids, angleDeg: 20, optics, ...extra })

describe('the formulas', () => {
    it('a lamp 10 m over the floor, 20 deg, straight down: a 3.53 m spot', () => {
        expect(spotDiameter(10, 20)).toBeCloseTo(3.5265, 3)
        const fp = down()
        expect(fp.surface).toBe('floor')
        expect(fp.throwM).toBeCloseTo(10, 6)
        expect(Number(fp.spotM.toFixed(2))).toBe(3.53)
        expect(fp.incidenceDeg).toBeCloseTo(0, 6)
        expect(fp.majorM).toBeCloseTo(fp.spotM, 9)
    })

    it('lux = I / d^2: 1000 lux at 10 m is 100,000 cd, so 1000 lux at 10 m and 4000 lux at 5 m', () => {
        expect(illuminance(100000, 10, 1)).toBe(1000)
        expect(illuminance(100000, 5, 1)).toBe(4000)
        const fp = down()
        expect(fp.candela).toBe(100000)
        expect(fp.lux).toBeCloseTo(1000, 6)
    })

    it('the incidence cosine: a beam 60 deg off the floor normal lights 0.5 of the axis figure and an ellipse twice as long', () => {
        const dir = [Math.sin(60 * DEG), -Math.cos(60 * DEG), 0]
        expect(cosIncidence(dir, [0, 1, 0])).toBeCloseTo(0.5, 9)
        const fp = down({ dir, maxReach: 60 })
        expect(fp.throwM).toBeCloseTo(20, 6) // 10 / cos 60
        expect(fp.incidenceDeg).toBeCloseTo(60, 6)
        expect(fp.lux).toBeCloseTo((100000 / 400) * 0.5, 6)
        expect(fp.majorM).toBeCloseTo(10 * (Math.tan(70 * DEG) - Math.tan(50 * DEG)), 9) // exact cone on a plane: 10 m to the floor square to it
    })

    it('grazing: when incidence + half the beam reaches 90 deg the cone never lands, and no ellipse is claimed', () => {
        expect(ellipseMajor(2, 60, 20)).toBeGreaterThan(4) // the old D / cos(i) was 4; the exact long axis is longer
        expect(ellipseMajor(2, 80, 20)).toBeNull()
        // review B4-3: d = 10 m along the axis, beam 25 deg, 60 deg off the normal: 10.4 m (the old formula said 8.9), at 70 deg 20.6 m (old 13.0)
        expect(ellipseMajor(spotDiameter(10, 25), 60, 25)).toBeCloseTo(10.4, 1)
        expect(ellipseMajor(spotDiameter(10, 25), 70, 25)).toBeCloseTo(20.6, 1)
        const fp = down({ from: [0, 0.5, 5], dir: [Math.sin(85 * DEG), -Math.cos(85 * DEG), 0], maxReach: 60 })
        expect(fp.surface).toBe('floor')
        expect(fp.incidenceDeg).toBeCloseTo(85, 6)
        expect(fp.majorM).toBeNull()
        expect(fp.flags).toContain('grazing')
        expect(fp.flags).toContain('wide')
    })
})

describe('the ray against the hall', () => {
    it('open air: nothing within the reach', () => {
        const fp = down({ maxReach: 5 })
        expect(fp.surface).toBe('open air')
        expect(fp.throwM).toBeNull()
        expect(fp.lux).toBeNull()
        expect(fp.flags).toContain('open-air')
        expect(castRay([0, 10, 5], [0, -1, 0], { building, solids, maxReach: 9.9 }).hit).toBe('open air')
        expect(castRay([0, 10, 5], [0, -1, 0], { building, solids, maxReach: 10.1 }).hit).toBe('floor')
    })

    it('a wall, the roof deck, a lantern top, its side, the press, a column', () => {
        const wall = castRay([0, 5, 0], [1, 0, 0], { building, solids: [], maxReach: 60 })
        expect(wall).toMatchObject({ hit: 'wall', normal: [-1, 0, 0] })
        expect(wall.throw).toBeCloseTo(20, 6)
        const deck = castRay([0, 5, 10], [0, 1, 0], { building, solids, maxReach: 60 })
        expect(deck).toMatchObject({ hit: 'roof', detail: 'roof deck', normal: [0, -1, 0] })
        expect(deck.throw).toBeCloseTo(7, 6)
        const top = castRay([0, 5, 0], [0, 1, 0], { building, solids, maxReach: 60 })
        expect(top).toMatchObject({ hit: 'roof', detail: 'lantern top' })
        expect(top.throw).toBeCloseTo(9.7, 6) // lantern top 15 - 0.3, as rig-lib surfaceHit
        // rising through the opening, above the deck (y 12), and out of its footprint sideways at x = 2, y = 13: the lantern's side
        const side = castRay([0, 5, 0], unitOf([0.25, 1, 0]), { building, solids, maxReach: 60 })
        expect(side).toMatchObject({ hit: 'roof', detail: 'lantern side', normal: [-1, 0, 0] })
        expect(side.point[0]).toBeCloseTo(2, 3)
        expect(side.point[1]).toBeCloseTo(13, 3)
        // the same slope from under the deck, outside the footprint: the deck, not a lantern
        expect(castRay([0, 5, 0], unitOf([1, 1, 0]), { building, solids, maxReach: 60 })).toMatchObject({ hit: 'roof', detail: 'roof deck' })
        const press = castRay([0, 1, 0], [1, 0, 0], { building, solids, maxReach: 60 })
        expect(press).toMatchObject({ hit: 'machine', detail: 'press', normal: [-1, 0, 0] })
        expect(press.throw).toBeCloseTo(5, 6)
        const column = castRay([0, 2, 10], [1, 0, 0], { building, solids, maxReach: 60 })
        expect(column).toMatchObject({ hit: 'column', normal: [-1, 0, 0] })
        expect(column.throw).toBeCloseTo(11.6, 6)
    })

    it('a box in its own frame: a bar turned 90 deg about z lies along -x, its top at 0.5 m', () => {
        const bar = { pos: [0, 0, 0], size: [1, 2, 1], rotation: [0, 0, Math.PI / 2] }
        expect(eulerXYZ(bar.rotation)[0][1]).toBeCloseTo(-1, 9)
        const hit = rayObb([-1, 5, 0], [0, -1, 0], bar)
        expect(hit.t).toBeCloseTo(4.5, 9)
        expect(hit.normal[1]).toBeCloseTo(1, 9)
        expect(rayObb([1, 5, 0], [0, -1, 0], bar)).toBeNull()
        expect(rayBox([0, 1, 0], [1, 0, 0], { x: [-1, 1], y: [0, 2], z: [-1, 1] })).toBeNull() // the origin is inside: not a hit
    })
})

describe('the flags and the basis', () => {
    it('a basis that is not EXACT is flagged, EXACT is not, a missing basis is', () => {
        const flags = (o) => down({ optics: o }).flags
        expect(flags(optics)).toContain('borrowed')
        expect(flags({ ...optics, photometryBasis: 'ASSUMED' })).toContain('borrowed')
        expect(flags({ ...optics, photometryBasis: 'EXACT' })).not.toContain('borrowed')
        expect(flags({ ...optics, photometryBasis: undefined })).toContain('borrowed')
        expect(down().basis).toBe('EQUIVALENT')
    })

    it('no lux in the optics: no figure, never an invented one', () => {
        const fp = down({ angleDeg: 45, optics: { ...optics, lux: null, at_m: null, beam_deg: 45, photometryBasis: 'ASSUMED' } })
        expect(fp.lux).toBeNull()
        expect(fp.candela).toBeNull()
        expect(fp.flags).toContain('no-figure')
        expect(fp.spotM).toBeCloseTo(spotDiameter(10, 45), 9)
    })

    it('wide, tight, dim and out', () => {
        expect(flagsOf({ surface: 'floor', spot: 6.01, major: 6.01, lux: 100, basis: 'EXACT' })).toEqual(['wide'])
        expect(flagsOf({ surface: 'floor', spot: THRESHOLDS.wideM, major: THRESHOLDS.wideM, lux: 100, basis: 'EXACT' })).toEqual([])
        expect(flagsOf({ surface: 'floor', spot: 0.49, major: 0.49, lux: 100, basis: 'EXACT' })).toEqual(['tight'])
        expect(flagsOf({ surface: 'floor', spot: 1, major: 1, lux: 0.99, basis: 'EXACT' })).toEqual(['dim'])
        expect(flagsOf({ lit: false, surface: 'floor', spot: 20, lux: 0, basis: 'EQUIVALENT' })).toEqual(['out'])
        expect(down({ angleDeg: 1.8 }).flags).toContain('tight')
        expect(down({ angleDeg: 60 }).flags).toContain('wide')
    })
})

// ---------------------------------------------------------------------------
// The two ground versions, from the committed files.
// ---------------------------------------------------------------------------
const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const library = loadLibrary()

// 2026-10-02: the hall record now carries the permanent objects near the stage (hall dims layer 2026-10-02,
// `massing_add`: transformer, cabinets, pipe rack, canopy, drum tank, cabin …). Gevorg's two ground versions were
// designed before them and some of their beams now stand against a pipe or the canopy (recorded in the session
// note); these tests keep checking them against the hall as it was designed for (the objects left out).
// Known · full, the live room, is checked in versions.test.js against the full record.
const withoutPermanentObjects = (h) => {
    const layer = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/place/rigs/moxir-hall-dims-2026-10-02.json'), 'utf8'))
    const added = new Set((layer.massing_add || []).map((m) => m.id))
    return { ...h, geometry: { ...h.geometry, massing: h.geometry.massing.filter((m) => !added.has(m.id)) } }
}
describe.each(['minimal-ground', 'full-ground'])('%s: every lamp of every look', (id) => {
    const rig = read(rigFileOf(spec.set, id))
    const realHall = withoutPermanentObjects(read(rig.hall || spec.hall))
    const result = analyse({ rig, hall: realHall, manifest, geometry, library, version: id })
    const lamps = rig.groups.reduce((n, g) => n + g.count, 0)
    const allRows = result.looks.flatMap((l) => l.rows)

    it('has a row for every lamp in every look, each carrying its basis, and is deterministic', () => {
        expect(result.looks.map((l) => l.id)).toEqual(Object.keys(rig.looks))
        for (const look of result.looks) {
            expect(look.rows.length).toBeLessThanOrEqual(lamps) // a refused laser drops out of buildRig
            expect(look.rows.length).toBeGreaterThan(lamps - 3)
        }
        for (const row of allRows) {
            expect(['EXACT', 'EQUIVALENT', 'ASSUMED', 'NONE']).toContain(row.basis)
            if (row.lit && row.basis !== 'EXACT') expect(row.flags).toContain('borrowed')
            for (const v of [row.x, row.y, row.z, row.dx, row.dy, row.dz]) expect(Number.isFinite(v)).toBe(true)
        }
        const again = analyse({ rig, hall: realHall, manifest, geometry, library, version: id })
        expect(toCsv(again.looks.flatMap((l) => l.rows))).toBe(toCsv(allRows))
    })

    it('agrees with rig-lib surfaceHit on the planes and machines, and is never longer than it', () => {
        let compared = 0
        for (const look of result.looks) {
            for (const row of look.rows) {
                const reach = rig.classes[rig.groups.find((g) => g.id === row.group).class].reach_m
                const repo = surfaceHit([row.x, row.y, row.z], [row.dx, row.dy, row.dz], realHall, reach)
                if (row.surface === 'open air') {
                    expect(repo).toBeGreaterThanOrEqual(reach - 0.11)
                    continue
                }
                expect(row.throwM).toBeLessThanOrEqual(repo + 0.11)
                if (['floor', 'roof', 'wall', 'machine'].includes(row.surface)) {
                    expect(Math.abs(row.throwM - repo)).toBeLessThanOrEqual(0.11)
                    compared += 1
                }
            }
        }
        expect(compared).toBeGreaterThan(50)
    })

    it('the B380F lux is the optics lux x at_m^2 over the throw squared times the cosine; the COB has no figure', () => {
        const { optics: o } = library.types.find((t) => t.id === 'up-b380f')
        const rows = allRows.filter((x) => x.type === 'up-b380f' && x.lit && x.surface !== 'open air' && !x.flags.includes('near-field'))
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            const expected = ((o.lux * o.at_m ** 2) / row.throwM ** 2) * Math.cos(row.incidenceDeg * DEG)
            expect(Math.abs(row.lux / expected - 1)).toBeLessThan(0.01)
            expect(row.basis).toBe('EQUIVALENT')
            expect(row.beamDeg).toBe(1.8)
        }
        const cob = allRows.filter((x) => x.type === 'up-cob200' && x.lit && x.surface !== 'open air')
        expect(cob.length).toBeGreaterThan(0)
        for (const row of cob) {
            expect(row.lux).toBeNull()
            expect(row.basis).toBe('ASSUMED')
            expect(row.flags).toContain('no-figure')
        }
    })

    it('a look with a solo has one lit lamp, and the words carry the numbers', () => {
        const shaft = result.looks.find((l) => l.id === 'gs-one-shaft')
        expect(shaft.rows.filter((x) => x.lit)).toHaveLength(1)
        expect(shaft.summary.lit).toBe(1)
        expect(wordsFor(shaft)).toMatch(/gs-one-shaft/)
        expect(wordsFor(shaft)).toMatch(/lux/)
    })
})

describe('review B4: near field, borrowed words', () => {
    it('B4-1: a 1.8 deg lamp 1.5 m from the floor prints no spot and no lux, and says so', () => {
        const fp = footprint({ from: [0, 1.5, 5], dir: [0, -1, 0], maxReach: 30, building, solids, angleDeg: 1.8, optics })
        expect(fp.flags).toContain('near-field')
        expect(fp.spotM).toBeNull()
        expect(fp.lux).toBeNull()
        expect(fp.flags).not.toContain('tight')
        // the same lamp far away is still a measured-by-formula figure
        expect(down({ angleDeg: 1.8 }).lux).not.toBeNull()
        expect(down({ angleDeg: 1.8 }).flags).not.toContain('near-field')
        // a wide beam close up is not near-field
        expect(footprint({ from: [0, 1.5, 5], dir: [0, -1, 0], maxReach: 30, building, solids, angleDeg: 20, optics }).flags).not.toContain('near-field')
        const look = { id: 'l', title: 'L', rows: [{ lit: true, group: 'g', surface: 'floor', code: 'X', beamDeg: 1.8, level: 1, reachM: 20, throwM: 1.5, spotM: null, luxAtLevel: null, basis: 'EQUIVALENT', basisSrc: 'TEST', flags: fp.flags }], summary: { flags: { 'near-field': 1 }, areaM2: 0, brightest: null, dimmest: null } }
        expect(wordsFor(look)).toMatch(/near-field: figure not valid/)
    })

    it('B4-2: the words say when the figures are borrowed', () => {
        const row = { lit: true, group: 'g', surface: 'floor', code: 'X', beamDeg: 20, level: 1, reachM: 20, throwM: 10, spotM: 3.5, luxAtLevel: 1000, basis: 'EQUIVALENT', basisSrc: 'Maker Y', flags: ['borrowed'] }
        const look = (basis) => ({ id: 'l', title: 'L', rows: [{ ...row, basis }], summary: { flags: basis === 'EXACT' ? {} : { borrowed: 1 }, areaM2: 1, brightest: { id: 'a', lux: 1000 }, dimmest: { id: 'a', lux: 1000 } } })
        expect(wordsFor(look('EQUIVALENT'))).toMatch(/borrowed from another product.*Maker Y/)
        expect(wordsFor(look('EXACT'))).not.toMatch(/borrowed/)
    })
})
