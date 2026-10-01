import { describe, expect, it } from 'vitest'
import { DEFAULT_COLOR, intensityFor, workLightOp } from './work-light.mjs'

const room = (exposure, extra = []) => ({
    renderSettings: exposure === undefined ? {} : { toneMappingExposure: exposure },
    entities: [{ id: 'rig-show', components: {} }, ...extra]
})

describe('work light', () => {
    it('is scene-referred: the same level on screen through any exposure', () => {
        expect(intensityFor(1.4, 3.5)).toBe(0.4)
        expect(intensityFor(1.4, 1)).toBe(1.4)
        expect(intensityFor(1.4, 3.5) * 3.5).toBeCloseTo(intensityFor(1.4, 1) * 1, 3)
    })
    it('treats a missing or broken exposure as 1', () => {
        expect(intensityFor(1.4, undefined)).toBe(1.4)
        expect(intensityFor(1.4, 0)).toBe(1.4)
        expect(intensityFor(1.4, 'x')).toBe(1.4)
    })
    it('writes only the ambient light, in the neutral colour', () => {
        const op = workLightOp(room(3.5))
        expect(op).toEqual({ type: 'setWorldState', payload: { patch: { ambientLight: { color: DEFAULT_COLOR, intensity: 0.4 } } } })
        expect(Object.keys(op.payload.patch)).toEqual(['ambientLight'])
    })
    it('leaves rooms without a rig show alone', () => {
        expect(workLightOp({ entities: [{ id: 'place-hall' }] })).toBeNull()
        expect(workLightOp({})).toBeNull()
    })
})
