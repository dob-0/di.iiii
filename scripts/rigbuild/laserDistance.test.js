// @vitest-environment node
// The laser >= 3 m audience-distance check, over every version of MOXIR 17.10 in every look, read
// from ONE module (scripts/place/laser-distance.mjs) the build refuses with too. Written 2026-10-13
// after the check inside versions.test.js was found to pick lasers by `fixture === 'laser'` only:
// the six LaserCubes of Known · full and Known · kit (fixture `lasercube`) were never checked there.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, buildRig } from '../place/rig-lib.mjs'
import { LASER_MIN_HEIGHT_M, laserDistanceFailures, laserLampFailure, laserLampsOf } from '../place/laser-distance.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { rotationFromPanTilt } from '../../src/project/viewport/spotLightAim.js'
import { allVersions, rigFileOf, VERSIONS_FILE } from './versions.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
// counted straight from the rig file, NOT through the module's selector: what the check must cover
const countOf = (rig, fixture) => rig.groups.filter((g) => rig.classes[g.class]?.fixture === fixture).reduce((s, g) => s + g.count, 0)

const versions = allVersions(spec).map((v) => ({ id: v.id, rig: read(rigFileOf(spec.set, v.id)) }))

describe('the laser distance check covers every laser', () => {
    it('the set carries 6 LaserCubes in each of Known · full and Known · kit — and no other version has one', () => {
        const cubes = Object.fromEntries(versions.map((v) => [v.id, countOf(v.rig, 'lasercube')]).filter(([, n]) => n > 0))
        expect(cubes).toEqual({ 'known-full': 6, 'known-kit': 6 })
    })

    for (const { id, rig } of versions) {
        const lasers = countOf(rig, 'laser') + countOf(rig, 'lasercube')
        if (!lasers) continue
        for (const look of Object.keys(rig.looks)) {
            const built = buildRig(rig, hall, { geometry, manifest, look })
            const checked = laserLampsOf(built.entities, rig, RIG_PREFIX)
            it(`${id} · ${look}: checks all ${lasers} laser(s), LaserCubes included, each ≥ ${LASER_MIN_HEIGHT_M} m up and rising`, () => {
                expect(built.summary.refused).toEqual([])
                expect(checked).toHaveLength(lasers)
                const cubeGroups = rig.groups.filter((g) => rig.classes[g.class]?.fixture === 'lasercube').map((g) => `${RIG_PREFIX}${g.id}-`)
                expect(checked.filter((e) => cubeGroups.some((p) => e.id.startsWith(p)))).toHaveLength(countOf(rig, 'lasercube'))
                expect(laserDistanceFailures(checked)).toEqual([])
            })
        }
    }
})

describe('the laser distance check itself', () => {
    // tilt as rotationFromPanTilt reads it: 0 straight down, 90 level, 180 straight up
    const lamp = (id, y, tilt) => ({ id, type: 'spotLight', components: { transform: { position: [0, y, 10], rotation: rotationFromPanTilt({ pan: 0, tilt }) } } })
    it('passes a laser hung at exactly 3 m and level or rising', () => {
        expect(laserLampFailure(lamp('a', LASER_MIN_HEIGHT_M, 90))).toBeNull()
        expect(laserLampFailure(lamp('a', 6, 150))).toBeNull()
    })
    it('fails one hung under 3 m, and one aimed down into the audience plane', () => {
        expect(laserLampFailure(lamp('low', 2.99, 150))).toMatch(/^low: hung at 2\.99 m, under 3 m/)
        expect(laserLampFailure(lamp('down', 6, 60))).toMatch(/^down: aimed downward/)
    })
    it('never lets a group claim another group\'s lamps by a shared prefix', () => {
        const rig = { groups: [{ id: 'laser', class: 'l' }, { id: 'laser-cut', class: 'p' }], classes: { l: { fixture: 'lasercube' }, p: { fixture: 'par' } } }
        const ids = laserLampsOf([lamp('rig-laser-01', 6, 90), lamp('rig-laser-cut-01', 6, 90)], rig, 'rig-').map((e) => e.id)
        expect(ids).toEqual(['rig-laser-01'])
    })
})
