// @vitest-environment node
// Known · kit (2026-10-09): the owner's decision — the show uses ONLY what ran at Sevan: 50 UP-PL5403, 18 UP-B380F,
// the 6 LaserCube Ultra MK2 and ONE UP-YZ31P smoke machine (no hazers). Its haze is the physics' own estimate for that
// one machine in the hall's air (calibrate: false, the two-zone model), not a number chosen against photographs.
// A copy beside Known · full: known-full is unchanged.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { buildRig, nightOps } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const rig = read('scripts/place/rigs/moxir-2026-10-17-known-kit.json')
const full = read('scripts/place/rigs/moxir-2026-10-17-known-full.json')
const hall = read(rig.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const built = buildRig(rig, hall, { geometry, manifest })
const byCode = (code) => built.entities.filter((e) => e.name?.startsWith(`${code} `))

describe('Known · kit: the Sevan kit and nothing else', () => {
    it('hangs 50 UP-PL5403, 18 UP-B380F, 6 LaserCubes and ONE smoke machine, and no hazer', () => {
        expect(byCode('UP-PL5403')).toHaveLength(50)
        expect(byCode('UP-B380F')).toHaveLength(18)
        expect(byCode('EXT-LC-ULTRA-MK2')).toHaveLength(6)
        // the machines stand as posed bodies (rig-lib effects): one smoke machine, no hazer
        const machines = built.fixtures.filter((f) => f.kind === 'smoke' || f.kind === 'hazer')
        expect(machines.map((f) => f.id)).toEqual(['smoke-1'])
        expect(rig.effects.map((f) => f.fixture)).toEqual(['smoke'])
        // the copy stands beside known-full, which keeps its 6 hazers and 4 smoke machines
        expect(full.effects.map((f) => f.fixture)).toContain('hazer')
    })

    it('writes the hall\'s air into the haze, uncalibrated, as the two-zone estimate with its source', () => {
        const ops = nightOps(rig, { realLights: built.summary.real })
        const atmosphere = ops.find((o) => o.type === 'setRenderSettings').payload.patch.atmosphere
        expect(atmosphere.haze).toMatchObject({ model: 'nf-ff', volume_m3: 186890, calibrate: false, kindLevels: { 'smoke-machine': 1 } })
        expect(atmosphere.haze.source).toMatch(/UNVALIDATED/)
        expect(atmosphere.anisotropy).toBe(0.74)
        // the notes stay in the rig file, never in the document
        expect(atmosphere.anisotropyWhy).toBeUndefined()
    })

    it('draws each LaserCube as a laser line from its 7.5 W diodes (owner N449), never as a lamp', () => {
        for (const e of byCode('EXT-LC-ULTRA-MK2')) {
            expect(e.components.beam.only).toBe(true)
            expect(e.components.beam.laser).toMatchObject({ mW: [4000, 2000, 1500], nm: [455, 525, 638], diameter_mm: 4, divergence_mrad: 1, sceneScale: rig.photometry.sceneScale })
        }
    })

    it('gives every real lamp no cutoff', () => {
        const real = built.entities.filter((e) => e.type === 'spotLight' && !e.components.beam.only)
        expect(real.length).toBe(68)
        for (const e of real) expect(e.components.light.distance).toBe(0)
    })
})
