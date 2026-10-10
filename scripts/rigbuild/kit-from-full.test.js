// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../place/common.mjs'
import { kitFromRig, kitOps } from './kit-from-full.mjs'

// a known-full document as dev holds it (shape only): 6 hazers, 4 smoke machines, lamps with a cutoff, 6 cubes as cones
const lamp = (id, type, distance, extra = {}) => ({ id, type: 'spotLight', components: { fixture: { type }, light: { distance, intensity: 1 }, beam: { visible: true, haze: 1, ...extra } } })
const machine = (id, type) => ({ id, type: 'group', components: { fixture: { type } } })
const doc = {
    entities: [
        ...Array.from({ length: 6 }, (_, i) => machine(`rig-hazer-${i + 1}`, 'ext-hazer')),
        ...[4, 2, 1, 3].map((i) => machine(`rig-smoke-0${i}`, 'up-yz31p')),
        lamp('rig-par-1', 'up-pl5403', 24),
        lamp('rig-beam-1', 'up-b380f', 25.4, { aperture: 0.08 }),
        lamp('rig-lasercube-cut-01', 'ext-lc-ultra-mk2', 48.8)
    ]
}

describe('kit-from-full: a known-full copy made the Sevan kit, as ops', () => {
    const kit = kitFromRig()
    const { ops, kept, deleted } = kitOps(doc, kit)
    it('keeps one smoke machine and deletes every hazer and the other three', () => {
        expect(kept).toBe('rig-smoke-01')
        expect(deleted).toHaveLength(9)
        expect(deleted.some((id) => id.startsWith('rig-smoke-01'))).toBe(false)
    })
    it('takes every lamp\'s cutoff away and keeps its drawn length', () => {
        const light = ops.filter((o) => o.type === 'updateComponent' && o.payload.component === 'light')
        expect(light.map((o) => o.payload.patch.distance)).toEqual([0, 0, 0])
        const beam = Object.fromEntries(ops.filter((o) => o.payload.component === 'beam').map((o) => [o.payload.entityId, o.payload.patch]))
        expect(beam['rig-par-1']).toEqual({ length: 24 })
        expect(beam['rig-lasercube-cut-01']).toMatchObject({ length: 48.8, only: true, laser: { mW: [2700, 1500, 1800], diameter_mm: 4, divergence_mrad: 1 } })
    })
    it('writes the kit\'s air: the two-zone haze, uncalibrated', () => {
        const rs = ops.find((o) => o.type === 'setRenderSettings').payload.patch.atmosphere
        expect(rs.haze).toMatchObject({ model: 'nf-ff', volume_m3: 186890, calibrate: false })
        expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/place/rigs/moxir-2026-10-17-known-kit.json'))).toBe(true)
    })
})
