import { describe, it, expect } from 'vitest'
import { isCameraCaged } from './PublicProjectSceneSurface.jsx'

describe('isCameraCaged', () => {
    it('cages only an explicitly locked fixed camera', () => {
        expect(isCameraCaged('fixed-camera', { locked: true })).toBe(true)
    })

    it('an unlocked authored camera is an opening shot, not a cage', () => {
        expect(isCameraCaged('fixed-camera', { locked: false })).toBe(false)
        expect(isCameraCaged('fixed-camera', undefined)).toBe(false)
    })

    it('scene entry is never caged', () => {
        expect(isCameraCaged('scene', { locked: true })).toBe(false)
    })
})
