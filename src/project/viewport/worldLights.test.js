import { describe, expect, it } from 'vitest'
import { arrivalLightsOf } from './worldLights.js'

describe('arrivalLightsOf — an authored 0 is dark', () => {
    it('keeps an ambient and a directional switched off', () => {
        const l = arrivalLightsOf({ ambientLight: { color: '#000000', intensity: 0 }, directionalLight: { color: '#8fa6d8', intensity: 0 } })
        expect(l.ambient.intensity).toBe(0)
        expect(l.directional.intensity).toBe(0)
    })
    it('falls back only when nothing is authored', () => {
        const l = arrivalLightsOf({})
        expect(l.ambient).toEqual({ color: '#ffffff', intensity: 0.85 })
        expect(l.directional).toEqual({ color: '#fff7ea', intensity: 1.15, position: [8, 12, 4] })
        expect(arrivalLightsOf({ ambientLight: { intensity: null } }).ambient.intensity).toBe(0.85)
    })
    it('keeps an authored value', () => {
        expect(arrivalLightsOf({ ambientLight: { color: '#8ea2c8', intensity: 0.5 } }).ambient).toEqual({ color: '#8ea2c8', intensity: 0.5 })
    })
})
