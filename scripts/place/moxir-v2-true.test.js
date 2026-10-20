// MOXIR v2, the true look with ONE smoke machine (2026-10-09): B tuned for thin haze (moxir_v2_true.py tune) and the frame
// harness's document change (moxir-v2-true-frames.cjs). The tuned rig file keeps the kit, every v2 safety rule on the re-aimed
// beams, its power and DMX checks, and states its air as the one machine's two-zone haze — never a uniform number.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { v1Entities, v1RenderOps } from '../rigbuild/epic-build.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { docForJob } = require('./moxir-v2-true-frames.cjs')
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, 'rigs', f), 'utf8'))
const B = read('moxir-v2-planes-2026-10-09.json')
const T = read('moxir-v2-planes-tuned-2026-10-09.json')
const count = (rig, type) => rig.fixtures.filter((f) => f.type === type).length

describe('MOXIR v2 B tuned for one machine', () => {
    it('is the same kit as B: 18 B380F, 50 PL5403, 1 smoke machine', () => {
        for (const [type, n] of [['up-b380f', 18], ['up-pl5403', 50], ['up-yz31p', 1]]) {
            expect(count(T, type)).toBe(n)
            expect(count(B, type)).toBe(n)
        }
    })
    it('states its air as the ONE machine\'s two-zone haze at the tank state, closed hall, not drying', () => {
        expect(T.atmosphere.haze).toMatchObject({ model: 'nf-ff', volume_m3: 186890, airChangesPerHour: 0.5, dries: false, minutes: 40, calibrate: false })
        expect(T.atmosphere.haze.source).toMatch(/UNVALIDATED/)
        const patch = v1RenderOps({ atmosphere: T.atmosphere })[0].payload.patch.atmosphere
        expect(patch.haze.dries).toBe(false)
        expect(patch.anisotropyWhy).toBeUndefined()
    })
    it('carries every tune as a labelled data change (T1-T6), none of them a gain on the room', () => {
        expect(T.tunes.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
        for (const t of T.tunes) {
            expect(t.change.length).toBeGreaterThan(10)
            expect(t.why.length).toBeGreaterThan(10)
        }
        // looks stay inside a lamp's real output: every level 0..1
        for (const lk of T.looks) {
            for (const [, [, level]] of Object.entries(lk.parts)) {
                expect(level).toBeGreaterThanOrEqual(0)
                expect(level).toBeLessThanOrEqual(1)
            }
        }
    })
    it('puts the machine under the plane-1 row and blows it through the heads (+z), every base within the near field', () => {
        const smoke = T.fixtures.find((f) => f.type === 'up-yz31p')
        expect(smoke.p).toEqual([-4.75, 1, -6.2])
        expect(smoke.r).toEqual([0, 0, 0])
        const nozzle = [smoke.p[0], smoke.p[1] + 0.1, smoke.p[2]]
        for (const f of T.fixtures.filter((x) => x.part.startsWith('plane 1'))) {
            expect(Math.hypot(f.p[0] - nozzle[0], f.p[1] - nozzle[1], f.p[2] - nozzle[2])).toBeLessThan(3.6) // the blob's outer edge, 1.2 r
        }
        expect(v1Entities({ fixtures: [smoke], solids: [] })[0].components.transform.rotation).toEqual([0, 0, 0])
    })
    it('keeps every re-aimed plane-1 beam out of the crowd and >= 3 m over every standing level', () => {
        const t3 = T.tunes.find((t) => t.id === 'T3')
        expect(t3.aims).toHaveLength(6)
        for (const a of t3.aims) {
            expect(a.rays_into_audience).toBe(0)
            if (a.lowest_over_standing_m != null) expect(a.lowest_over_standing_m).toBeGreaterThanOrEqual(3)
            expect(a.az_el[1]).toBeGreaterThanOrEqual(46) // the fan's lowest band: a pen of <= 2 m behind the DJ
        }
        expect(T.checks.beams_into_audience).toBe(0)
        expect(T.checks.circuits_ok).toBe(true)
        for (const b of T.checks.branches) expect(b.devices).toBeLessThanOrEqual(32)
    })
    it('the plane-1 air glow from the floor (design metric) is higher after the tune in every haze state', () => {
        const g = T.design_metric.plane1
        for (const st of ['t10', 't40', 'dry']) expect(g.after_T3[st].floor.G).toBeGreaterThan(g.before[st].floor.G * 2)
    })
})

describe('the frame harness changes only the browser\'s copy', () => {
    it('sets the air, one held cue for the look and the camera', () => {
        const doc = { renderSettings: { atmosphere: { scattering: 0.0169 }, exposure: { auto: false } }, mappingState: { cues: [{ id: 'x' }], loop: false } }
        const job = { look: 'peak', atmosphere: { anisotropy: 0.74, haze: { model: 'nf-ff', minutes: 10 } }, camera: { position: [0, 1.7, 51.5], target: [-3, 5, -10], fov: 60 } }
        const out = docForJob(doc, job, 1000)
        expect(out.renderSettings.atmosphere).toEqual(job.atmosphere)
        expect(out.renderSettings.exposure).toEqual({ auto: false })
        expect(out.mappingState.cues).toEqual([{ id: 'true-peak', name: 'held: peak', key: '', fade: 0, hold: 3600, lightLook: 'rig-peak', surfaces: {} }])
        expect(out.mappingState.showEpoch).toBe(500)
        expect(out.presentationState.fixedCamera.position).toEqual([0, 1.7, 51.5])
    })
})
