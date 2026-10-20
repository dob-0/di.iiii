import { describe, expect, it } from 'vitest'
import { beamAirRadiance } from './beamAir.js'
import {
    DEFAULT_HALL,
    HAZE_KINDS,
    MAX_HAZE_SOURCES,
    NOISE_TILE_M,
    buildHazeField,
    dropletMassFlow,
    extinctionEfficiency,
    fillScattering,
    hazeMachinesOf,
    hazeNoiseData,
    hazeScatteringAt,
    hazeSettingsOf,
    jetOf,
    jetScattering,
    massExtinction,
    removalTau,
    sampleHazeNoise
} from './hazeField.js'

const hazer = HAZE_KINDS.hazer
const fog = HAZE_KINDS['smoke-machine']

describe('massExtinction — anomalous diffraction (van de Hulst)', () => {
    it('Q tends to 2 for large droplets, and is ≈ 2.6 for a 1 µm oil droplet in green light', () => {
        expect(extinctionEfficiency(200, 1.47)).toBeCloseTo(2, 1)
        expect(extinctionEfficiency(1, 1.47)).toBeGreaterThan(2.5)
        expect(extinctionEfficiency(1, 1.47)).toBeLessThan(2.8)
    })
    it('1 µm oil droplets: 3·Q/(2·0.85e6 g/m³·1e-6 m)', () => {
        expect(massExtinction(1, 0.85)).toBeCloseTo((3 * extinctionEfficiency(1, 1.47)) / 1.7, 9)
    })
    it('the same mass in bigger droplets scatters less', () => {
        expect(massExtinction(3, 0.85)).toBeLessThan(massExtinction(1, 0.85) / 2)
    })
})

describe('the hall — droplets in, air out', () => {
    it('a fog dries out as well as being vented', () => {
        expect(removalTau(hazer, DEFAULT_HALL)).toBeCloseTo(10, 9) // 6 air changes an hour
        expect(removalTau(fog, DEFAULT_HALL)).toBeLessThan(fog.dryTau_min)
    })
    it('steady state C = ṁ·τ/V: six HZ-1000s at full in 12 000 m³ at 6 ACH', () => {
        const machines = Array.from({ length: 6 }, () => ({ kind: hazer, fluid_ml_per_min: 2.2, level: 1 }))
        const mdot = 6 * 2.2 * 0.85 // g/min of oil
        const C = (mdot * 10) / 12000 // g/m³
        expect(fillScattering(machines, DEFAULT_HALL)).toBeCloseTo(C * massExtinction(1, 0.85), 9)
        // ~0.033 /m: the same order as the 0.05 /m MOXIR was set to by eye against
        // photographs (RIG_BUILD.md §20) — the physics lands where the pictures did
        expect(fillScattering(machines, DEFAULT_HALL)).toBeGreaterThan(0.02)
        expect(fillScattering(machines, DEFAULT_HALL)).toBeLessThan(0.06)
    })
    it('switched on, it climbs to 63 % of steady in one τ', () => {
        const m = [{ kind: hazer, fluid_ml_per_min: 2.2, level: 1 }]
        expect(fillScattering(m, DEFAULT_HALL, 10) / fillScattering(m, DEFAULT_HALL)).toBeCloseTo(1 - Math.exp(-1), 9)
        expect(fillScattering(m, DEFAULT_HALL, 0)).toBe(0)
    })
    it('a fog machine keeps only its glycol', () => {
        expect(dropletMassFlow(fog, 150, 1)).toBeCloseTo(150 * 1.05 * 0.35, 9)
        expect(dropletMassFlow(hazer, 2.2, 0)).toBe(0)
    })
})

describe('the jet near a machine', () => {
    const jet = jetOf({ kind: hazer, fluid_ml_per_min: 2.2, level: 1, nozzle_d_mm: 70 })
    const axis = [0, 0, 1]
    it('at the nozzle: the output over the fan\'s flow', () => {
        const c0 = (2.2 * 0.85) / 60 / hazer.fan_m3_s
        expect(jet.sigma0).toBeCloseTo(c0 * massExtinction(1, 0.85), 9)
    })
    it('falls as 1/u along its axis past five diameters', () => {
        const at = (u) => jetScattering(jet, [0, 0, u], axis) / Math.exp(-u / jet.reach)
        expect(at(2) / at(4)).toBeCloseTo(2, 6)
    })
    it('is a Gaussian across, and nothing behind the nozzle', () => {
        const u = 3
        const w = jet.nozzle / 2 + jet.spread * u
        const onAxis = jetScattering(jet, [0, 0, u], axis)
        expect(jetScattering(jet, [w, 0, u], axis) / onAxis).toBeCloseTo(Math.exp(-1), 6)
        expect(jetScattering(jet, [0, 0, -0.5], axis)).toBe(0)
    })
    it('an idle machine blows nothing', () => {
        expect(jetOf({ kind: fog, fluid_ml_per_min: 150, level: 0 }).sigma0).toBe(0)
    })
})

describe('patchiness noise', () => {
    it('is deterministic, periodic over one tile, and averages ~0.5', () => {
        expect(hazeNoiseData()).toBe(hazeNoiseData())
        expect(sampleHazeNoise([0.3, 0.7, 0.1])).toBeCloseTo(sampleHazeNoise([1.3, -0.3, 2.1]), 9)
        let sum = 0
        const n = 2000
        for (let i = 0; i < n; i += 1) sum += sampleHazeNoise([(i * 0.6180339) % 1, (i * 0.4142135) % 1, (i * 0.7320508) % 1])
        expect(sum / n).toBeGreaterThan(0.4)
        expect(sum / n).toBeLessThan(0.6)
    })
})

const library = {
    'ext-hazer': { category: 'hazer', fluid_ml_per_min: { value: 2.2 }, nozzle_d_mm: 70, model3d: { lensY: 0.235 } },
    'up-yz31p': { category: 'smoke-machine', fluid_ml_per_min: { value: 150 }, nozzle_d_mm: 50, model3d: {} },
    'up-b380f': { category: 'moving-head' }
}
const typeOf = (id) => library[id] || null
const entities = [
    { id: 'rig-hazer-back-01', components: { transform: { position: [-4.5, 0, 3.95], rotation: [0, 0, 0] }, fixture: { type: 'ext-hazer', dmx: false } } },
    { id: 'rig-smoke-01', components: { transform: { position: [2, 0, 0], rotation: [0, Math.PI / 2, 0] }, fixture: { type: 'up-yz31p', dmx: false } } },
    { id: 'rig-b380-01', components: { transform: { position: [0, 6, 0] }, fixture: { type: 'up-b380f' } } },
    { id: 'box', components: { transform: { position: [0, 0, 0] } } }
]

describe('the machines in a room', () => {
    const machines = hazeMachinesOf(entities, typeOf)
    it('are the hazer and fog machine entities, typed by the library — not the lamps', () => {
        expect(machines.map((m) => m.id)).toEqual(['rig-hazer-back-01', 'rig-smoke-01'])
    })
    it('blow out of the model\'s front (+Z), turned with the entity, from the nozzle\'s height', () => {
        expect(machines[0].direction[2]).toBeCloseTo(1, 9)
        expect(machines[0].position[1]).toBeCloseTo(0.235, 9)
        expect(machines[1].direction[0]).toBeCloseTo(1, 9) // turned a quarter round Y: +Z → +X
        expect(machines[1].fluid_ml_per_min).toBe(150)
    })
})

describe('buildHazeField', () => {
    const machines = hazeMachinesOf(entities, typeOf)
    it('is null without haze settings — the room keeps its one scattering', () => {
        expect(hazeSettingsOf({ scattering: 0.05 })).toBeNull()
        expect(buildHazeField(null, machines)).toBeNull()
        expect(buildHazeField(hazeSettingsOf({ haze: {} }), [])).toBeNull()
    })
    it('runs hazers at their default level and fog machines off, unless the room says', () => {
        const field = buildHazeField(hazeSettingsOf({ haze: {} }), machines)
        expect(field.jets.map((j) => j.id)).toEqual(['rig-hazer-back-01'])
        const fired = buildHazeField(hazeSettingsOf({ haze: { levels: { 'rig-smoke-01': 1 } } }), machines)
        expect(fired.jets.map((j) => j.id)).toEqual(['rig-hazer-back-01', 'rig-smoke-01'])
        expect(fired.fill).toBeGreaterThan(field.fill)
    })
    it('takes no more machines than a shader holds', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ ...machines[0], id: `h${i}` }))
        expect(buildHazeField(hazeSettingsOf({ haze: {} }), many).jets).toHaveLength(MAX_HAZE_SOURCES)
    })
    it('is the fill away from the jets, more inside one', () => {
        const field = buildHazeField(hazeSettingsOf({ haze: { patchiness: 0 } }), machines)
        expect(hazeScatteringAt(field, [20, 5, -20])).toBeCloseTo(field.fill, 12)
        const nozzle = machines[0].position
        expect(hazeScatteringAt(field, [nozzle[0], nozzle[1], nozzle[2] + 1])).toBeGreaterThan(5 * field.fill)
    })
    it('swings the fill by ±patchiness, drifting with the air', () => {
        const field = buildHazeField(hazeSettingsOf({ haze: { patchiness: 0.4, drift: [1, 0, 0] } }), machines)
        const far = [30, 4, -30]
        const s = hazeScatteringAt(field, far, 0)
        expect(s).toBeGreaterThanOrEqual(field.fill * 0.6 - 1e-12)
        expect(s).toBeLessThanOrEqual(field.fill * 1.4 + 1e-12)
        // after the air has moved one tile, the same eddy is back
        expect(hazeScatteringAt(field, far, NOISE_TILE_M)).toBeCloseTo(s, 9)
    })
})

describe('the beam through a field', () => {
    const beam = { candela: 1e6, aperture: 0.08, tanHalf: Math.tan(0.0157), length: 20, edge: 0.2, scattering: 0.04, anisotropy: 0.7 }
    const ro = [-6, -8, 0]
    const rd = [1, 0, 0]
    it('a uniform field draws exactly the old uniform haze', () => {
        expect(beamAirRadiance(ro, rd, { ...beam, sigmaAt: () => 0.04 })).toBeCloseTo(beamAirRadiance(ro, rd, beam), 12)
    })
    it('a beam through a plume is brighter there', () => {
        const plume = (p) => 0.04 + (Math.abs(p[1] + 8) < 1 ? 0.2 : 0)
        expect(beamAirRadiance(ro, rd, { ...beam, sigmaAt: plume })).toBeGreaterThan(5 * beamAirRadiance(ro, rd, beam))
    })
})

describe('the fog the haze lays on the surfaces', () => {
    it('is Beer–Lambert at the fill\'s σ — the beams\' own law — not the linear 0 … 1.6/σ stand-in', async () => {
        const { hazeFogBase, setAtmosphere, setHazeMachines } = await import('./atmosphereStore.js')
        const { fogFactorAt } = await import('./beerLambertFog.js')
        const gl = {} // a renderer key
        setAtmosphere(gl, { scattering: 0.02, anisotropy: 0.7, haze: null })
        setHazeMachines(gl, [])
        const base = hazeFogBase(gl)
        // a surface 60 m away keeps exp(−0.02·60) ≈ 30 % of its light (the old 60 … 250 m fog kept 100 %)
        expect(1 - fogFactorAt(60, base.near, base.far)).toBeCloseTo(Math.exp(-1.2), 9)
        setAtmosphere(gl, null)
        expect(hazeFogBase(gl, { near: 60, far: 250 })).toEqual({ near: 60, far: 250 })
    })
})

describe('one machine in a big hall — the two-zone estimate (model nf-ff)', () => {
    const smoke = { id: 'rig-smoke-01', category: 'smoke-machine', kind: fog, fluid_ml_per_min: 150, nozzle_d_mm: 50, position: [10, 0.3, 30], direction: [0, 0, 1] }
    const settings = hazeSettingsOf({ scattering: 0.02, haze: { model: 'nf-ff', volume_m3: 186890, airChangesPerHour: 6, kindLevels: { 'smoke-machine': 1 }, nearField: { radius_m: 3, airSpeed_m_s: 0.1 }, source: 'UNVALIDATED estimate' } })
    it('is never calibrated to the hand-set scattering, and gives the hall its far field', () => {
        expect(settings.model).toBe('nf-ff')
        expect(settings.calibrateTo).toBe(null)
        const field = buildHazeField(settings, [smoke])
        expect(field.scale).toBe(1)
        // ≈ 2.7 × 10⁻⁴ /m everywhere, not the 0.02 /m the document asks for
        expect(field.fill).toBeGreaterThan(2.5e-4)
        expect(field.fill).toBeLessThan(2.9e-4)
        expect(field.zones[0].near).toBeGreaterThan(0.2)
        expect(field.source).toMatch(/UNVALIDATED/)
    })
    it('draws the near field around the machine: denser within 3 m, the fill beyond', () => {
        const field = buildHazeField({ ...settings, patchiness: 0 }, [smoke])
        expect(field.blobs).toHaveLength(1)
        const beside = hazeScatteringAt(field, [10, 1.5, 29], 0) // 1.7 m from the nozzle, behind it
        const far = hazeScatteringAt(field, [40, 5, 60], 0)
        expect(beside).toBeGreaterThan(0.15)
        expect(far).toBeCloseTo(field.fill, 9)
    })
    it('dries: false is the closed-hall best case — 0.5 air changes, no drying: ~0.0024 /m at 10 min, ~0.0086 /m at 40 min (the tank)', () => {
        const at = (minutes) => buildHazeField(hazeSettingsOf({ haze: { model: 'nf-ff', volume_m3: 186890, airChangesPerHour: 0.5, dries: false, minutes, kindLevels: { 'smoke-machine': 1 }, nearField: { radius_m: 3, airSpeed_m_s: 0.1 } } }), [smoke])
        expect(at(10).fill).toBeGreaterThan(2.2e-3)
        expect(at(10).fill).toBeLessThan(2.5e-3)
        expect(at(40).fill).toBeGreaterThan(8.3e-3)
        expect(at(40).fill).toBeLessThan(8.8e-3)
        // the kind keeps drying when the document does not say otherwise: the same hall, steady in minutes, ~30x thinner
        const drying = buildHazeField(hazeSettingsOf({ haze: { model: 'nf-ff', volume_m3: 186890, airChangesPerHour: 0.5, minutes: 40, kindLevels: { 'smoke-machine': 1 } } }), [smoke])
        expect(drying.fill).toBeLessThan(at(40).fill / 10)
    })
    it('a machine at 0 leaves the hall clear', () => {
        const off = buildHazeField(hazeSettingsOf({ haze: { model: 'nf-ff', volume_m3: 186890, kindLevels: { 'smoke-machine': 0 } } }), [smoke])
        expect(off.fill).toBe(0)
        expect(off.jets).toHaveLength(0)
    })
})

describe('calibration — the photographed haze, spread by the machines', () => {
    const machines = hazeMachinesOf(entities, typeOf)
    it('the machines at their usual levels give exactly the room hand-set scattering', () => {
        const field = buildHazeField(hazeSettingsOf({ scattering: 0.05, haze: { patchiness: 0 } }), machines)
        expect(field.fill).toBeCloseTo(0.05, 9)
    })
    it('turning the hazer up from its usual 0.6 to full thickens the hall by that ratio', () => {
        const usual = buildHazeField(hazeSettingsOf({ scattering: 0.05, haze: {} }), machines)
        const full = buildHazeField(hazeSettingsOf({ scattering: 0.05, haze: { kindLevels: { hazer: 1 } } }), machines)
        expect(full.fill / usual.fill).toBeCloseTo(1 / 0.6, 6)
    })
    it('calibrate: false trusts the physics own number', () => {
        const raw = buildHazeField(hazeSettingsOf({ scattering: 0.05, haze: { calibrate: false } }), machines)
        expect(raw.scale).toBe(1)
    })
})
