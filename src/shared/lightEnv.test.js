import { describe, expect, it } from 'vitest'
import { applyLightEnv, lightEnvDiff, lightEnvOf, lightEnvOps, lightEnvSummary } from './lightEnv.js'

// v2-11 as the audit found it (light-env-report.md §1): the physics' own haze number, ambient 0.3.
const v211 = () => ({
    renderSettings: {
        toneMapping: 'ACESFilmic',
        toneMappingExposure: 3.5,
        bloom: { enabled: true },
        surfaces: { floor: { albedo: 1.7 } },
        atmosphere: {
            scattering: 0.0169,
            anisotropy: 0.74,
            haze: { volume_m3: 186890, calibrate: false, model: 'nf-ff', nearField: { radius_m: 3, airSpeed_m_s: 0.1 }, source: 'estimate' }
        }
    },
    worldState: { fog: { near: 0, far: 32, enabled: true }, ambientLight: { color: '#a39c92', intensity: 0.3 } },
    entities: [{ id: 'lamp', light: { intensity: 50 } }]
})
// known-full: the measured hall haze, calibrated, ambient 0.1, no near-field model.
const knownFull = () => ({
    renderSettings: { ...v211().renderSettings, atmosphere: { scattering: 0.02, anisotropy: 0.74, haze: { volume_m3: 186890 } } },
    worldState: { ...v211().worldState, ambientLight: { color: '#a39c92', intensity: 0.6 } }
})

describe('lightEnv', () => {
    it('lightEnvOf carries the groups the document has, never a lamp', () => {
        const env = lightEnvOf(v211())
        expect(Object.keys(env).sort()).toEqual(['ambient', 'atmosphere', 'bloom', 'exposure', 'fog', 'surfaces'])
        expect(JSON.stringify(env)).not.toContain('lamp')
        expect(Object.keys(lightEnvOf({ renderSettings: { bloom: { enabled: false } } }))).toEqual(['bloom'])
    })
    it('known-full → v2-11 is 6 leaves: scattering, the three stale haze keys + source, and the ambient', () => {
        const diff = lightEnvDiff(v211(), knownFull())
        expect(diff.map((d) => d.path.join('.')).sort()).toEqual([
            'renderSettings.atmosphere.haze.calibrate',
            'renderSettings.atmosphere.haze.model',
            'renderSettings.atmosphere.haze.nearField',
            'renderSettings.atmosphere.haze.source',
            'renderSettings.atmosphere.scattering',
            'worldState.ambientLight.intensity'
        ])
        expect(diff.find((d) => d.path.at(-1) === 'model')).toMatchObject({ before: 'nf-ff', after: null })
    })
    it('an identical environment has no diff', () => {
        expect(lightEnvDiff(v211(), v211())).toEqual([])
    })
    it('applyLightEnv returns a new document with that environment and leaves the input and the lamps alone', () => {
        const target = v211()
        const frozen = JSON.stringify(target)
        const next = applyLightEnv(target, lightEnvOf(knownFull()))
        expect(JSON.stringify(target)).toBe(frozen)
        expect(next).not.toBe(target)
        expect(next.entities).toBe(target.entities)
        expect(next.renderSettings.atmosphere.haze.model).toBeUndefined()
        expect(lightEnvDiff(next, knownFull())).toEqual([])
        expect(lightEnvDiff(target, next)).toHaveLength(6)
    })
    it('a group the env lacks is kept', () => {
        const next = applyLightEnv(v211(), lightEnvOf({ worldState: { ambientLight: { intensity: 1 } } }))
        expect(next.renderSettings.toneMappingExposure).toBe(3.5)
        expect(next.worldState.ambientLight).toEqual({ intensity: 1 })
    })
    it('lightEnvSummary gives the five numbers', () => {
        expect(lightEnvSummary(v211())).toEqual({ haze: 0.0169, calibrated: false, ambient: 0.3, exposure: 3.5, bloom: true, surfaces: true })
        expect(lightEnvSummary(knownFull())).toMatchObject({ haze: 0.02, calibrated: true, ambient: 0.6 })
        expect(lightEnvSummary({})).toEqual({ haze: null, calibrated: true, ambient: null, exposure: null, bloom: false, surfaces: false })
    })
    it('lightEnvOps: the 6 leaves become one render-settings op and one world op, nulls deleting', () => {
        const ops = lightEnvOps(lightEnvDiff(v211(), knownFull()))
        expect(ops.map((o) => o.type)).toEqual(['setRenderSettings', 'setWorldState'])
        expect(ops[0].payload.patch.atmosphere).toMatchObject({ scattering: 0.02, haze: { model: null, calibrate: null, nearField: null, source: null } })
        expect(ops[1].payload.patch).toEqual({ ambientLight: { intensity: 0.6 } })
        expect(lightEnvOps([])).toEqual([])
    })
})
