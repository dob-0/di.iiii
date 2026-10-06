import { describe, expect, it, vi } from 'vitest'
import { FALLBACK_POWER_PREFERENCE, rendererWithFallback } from './rendererFallback.js'

const canvas = { tag: 'canvas' }

describe('rendererWithFallback', () => {
    it("builds the renderer R3F would, with R3F's defaults", () => {
        const create = vi.fn((attributes) => ({ attributes }))
        const renderer = rendererWithFallback({ antialias: false }, { create })(canvas)
        expect(create).toHaveBeenCalledTimes(1)
        expect(renderer.attributes).toEqual({ powerPreference: 'high-performance', antialias: false, alpha: true, canvas })
    })

    it("retries once with 'default' when the preferred power gives no context (Chromium + NVIDIA on Linux)", () => {
        const warn = vi.fn()
        const create = vi.fn((attributes) => {
            if (attributes.powerPreference === 'high-performance') throw new Error('Error creating WebGL context.')
            return { attributes }
        })
        const renderer = rendererWithFallback({}, { create, warn })(canvas)
        expect(create).toHaveBeenCalledTimes(2)
        expect(renderer.attributes.powerPreference).toBe(FALLBACK_POWER_PREFERENCE)
        expect(renderer.attributes.canvas).toBe(canvas)
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it("does not loop when 'default' itself fails — the error reaches the context guard", () => {
        const create = vi.fn(() => { throw new Error('no WebGL') })
        expect(() => rendererWithFallback({ powerPreference: 'default' }, { create, warn: () => {} })(canvas)).toThrow('no WebGL')
        expect(create).toHaveBeenCalledTimes(1)
        expect(() => rendererWithFallback({}, { create, warn: () => {} })(canvas)).toThrow('no WebGL')
        expect(create).toHaveBeenCalledTimes(3)
    })
})
