import { describe, expect, it } from 'vitest'
import { OUTPUT_POOL_SLOTS, normalizeQuality, outputDocument, outputModeWanted, outputRenderSettings, isSoftwareRenderer } from './outputMode.js'

describe('outputModeWanted', () => {
    it('starts a desktop with a real GPU in High, a phone or a software renderer in Low (owner 2026-10-15)', () => {
        expect(outputModeWanted({ workMachine: true })).toBe(false)
        expect(outputModeWanted({ workMachine: false })).toBe(false) // a hosted room on a desktop: High too
        expect(outputModeWanted({ workMachine: true, coarse: true })).toBe(true)
        expect(outputModeWanted({ workMachine: false, coarse: true })).toBe(true)
        expect(outputModeWanted({ softwareGl: true })).toBe(true)
        expect(isSoftwareRenderer('Google SwiftShader')).toBe(true)
        expect(isSoftwareRenderer('llvmpipe (LLVM 17.0.6, 256 bits)')).toBe(true)
        expect(isSoftwareRenderer('ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3080 Laptop GPU (0x0000249C)), NVIDIA)')).toBe(false)
        expect(isSoftwareRenderer('')).toBe(false)
    })
    it('reads the new words and the retired ones the same way, both in the address and in the stored value', () => {
        expect(normalizeQuality('low')).toBe('low')
        expect(normalizeQuality('Lite')).toBe('low')
        expect(normalizeQuality('HIGH')).toBe('high')
        expect(normalizeQuality('full')).toBe('high')
        expect(normalizeQuality('max')).toBeNull()
        expect(normalizeQuality(null)).toBeNull()
        expect(outputModeWanted({ search: '?quality=low' })).toBe(true)
        expect(outputModeWanted({ search: '?quality=lite' })).toBe(true)
        expect(outputModeWanted({ coarse: true, search: '?quality=high' })).toBe(false)
        expect(outputModeWanted({ coarse: true, search: '?quality=full' })).toBe(false)
        expect(outputModeWanted({ stored: 'low' })).toBe(true)
        expect(outputModeWanted({ stored: 'lite' })).toBe(true)
        expect(outputModeWanted({ coarse: true, stored: 'high' })).toBe(false)
        expect(outputModeWanted({ coarse: true, stored: 'full' })).toBe(false)
    })
    it('lets the address win over the stored choice, and the stored choice over the default', () => {
        expect(outputModeWanted({ workMachine: true, stored: 'full', search: '?quality=lite' })).toBe(true)
        expect(outputModeWanted({ coarse: true, stored: 'lite', search: '?x=1&quality=FULL' })).toBe(false)
        expect(outputModeWanted({ coarse: true, stored: 'full' })).toBe(false)
        expect(outputModeWanted({ workMachine: true, stored: 'lite' })).toBe(true)
        expect(outputModeWanted({ workMachine: true, stored: 'junk', search: '?quality=max', coarse: true })).toBe(true) // junk and an unknown quality fall back to the default
    })
})

describe('outputRenderSettings', () => {
    const full = {
        shadows: true, shadowCasting: { enabled: true, mapSize: 1024 }, antialias: true, dprMin: 1, dprMax: 2,
        bloom: { enabled: true }, surfaces: { floor: { reflect: 0.5 } },
        atmosphere: { scattering: 0.02, haze: {} }, toneMapping: 'ACESFilmic', toneMappingExposure: 3.5
    }
    it('drops shadows, bloom, the floor model and antialias, holds DPR 1, keeps the haze and the tone', () => {
        const out = outputRenderSettings(full)
        expect(out).toMatchObject({ shadows: false, shadowCasting: { enabled: false, mapSize: 1024 }, antialias: false, dprMin: 1, dprMax: 1 })
        expect(out).not.toHaveProperty('bloom')
        expect(out).not.toHaveProperty('surfaces')
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
