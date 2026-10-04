import { describe, expect, it } from 'vitest'
import { OUTPUT_POOL_SLOTS, outputDocument, outputModeWanted, outputRenderSettings } from './outputMode.js'

describe('outputModeWanted', () => {
    it('gives everyone Lite by default, the work machine included (owner, 2026-10-04)', () => {
        expect(outputModeWanted({})).toBe(true)
        expect(outputModeWanted({ search: '?x=1' })).toBe(true)
    })
    it('lets the address win over the stored choice, and the stored choice over the default', () => {
        expect(outputModeWanted({ stored: 'full', search: '?quality=lite' })).toBe(true)
        expect(outputModeWanted({ stored: 'lite', search: '?x=1&quality=FULL' })).toBe(false)
        expect(outputModeWanted({ stored: 'full' })).toBe(false)
        expect(outputModeWanted({ stored: 'junk', search: '?quality=max' })).toBe(true)
    })
})

describe('outputRenderSettings', () => {
    const full = {
        shadows: true, shadowCasting: { enabled: true, mapSize: 1024 }, antialias: true, dprMin: 1, dprMax: 2,
        bloom: { enabled: true }, surfaces: { floor: { reflect: 0.5 } },
        atmosphere: { scattering: 0.02, haze: {} }, toneMapping: 'ACESFilmic', toneMappingExposure: 3.5
    }
    it('drops shadows, bloom, the floor mirror and antialias, holds DPR 1, keeps the floor finish, the haze and the tone, and draws footprints', () => {
        const out = outputRenderSettings(full)
        expect(out).toMatchObject({ shadows: false, shadowCasting: { enabled: false, mapSize: 1024 }, antialias: false, dprMin: 1, dprMax: 1, lampFootprints: true })
        expect(out).not.toHaveProperty('bloom')
        expect(out.surfaces).toEqual({ floor: { reflect: 0 } })
        expect(full.surfaces.floor.reflect).toBe(0.5)
        expect(out.atmosphere).toBe(full.atmosphere)
        expect(out.toneMappingExposure).toBe(3.5)
        expect(full.bloom).toEqual({ enabled: true })
    })
    it('takes an absent setting', () => {
        expect(outputRenderSettings(undefined)).toMatchObject({ shadows: false, dprMax: 1 })
    })
})

describe('outputDocument', () => {
    it('turns the light pool on at the output slots, never above, and copies instead of writing', () => {
        const doc = { entities: [], renderSettings: {}, mappingState: { output: { width: 1 } } }
        const out = outputDocument(doc)
        expect(out.mappingState.lightPool).toEqual({ enabled: true, slots: OUTPUT_POOL_SLOTS })
        expect(out.mappingState.output).toBe(doc.mappingState.output)
        expect(out.entities).toBe(doc.entities)
        expect(doc.mappingState.lightPool).toBeUndefined()
        expect(outputDocument({ mappingState: { lightPool: { slots: 8 } } }).mappingState.lightPool.slots).toBe(OUTPUT_POOL_SLOTS)
        expect(outputDocument({ mappingState: { lightPool: { slots: 2, minHoldMs: 900 } } }).mappingState.lightPool).toEqual({ slots: 2, minHoldMs: 900, enabled: true })
        expect(outputDocument(null)).toBe(null)
    })
})
