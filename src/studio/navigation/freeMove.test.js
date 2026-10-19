import { describe, expect, it } from 'vitest'
import { FALLBACK_SPEED, autoSpeed, flyVelocity, normalizeSpeedSetting, normalizeTurnSetting, resolveSpeed, slideMetresPerPixel,
    speedModifier, turnDistance, wheelStep, zoomDragStep } from './freeMove.js'

describe('the standard move: one speed, the same everywhere', () => {
    it('settings: speed is auto or metres; turning is point or place; junk falls back', () => {
        expect(normalizeSpeedSetting('auto')).toBe('auto'); expect(normalizeSpeedSetting('2.5')).toBe(2.5)
        expect(normalizeSpeedSetting(-1)).toBe('auto'); expect(normalizeSpeedSetting('x')).toBe('auto'); expect(normalizeSpeedSetting(1e9)).toBe(10000)
        expect(normalizeTurnSetting('place')).toBe('place'); expect(normalizeTurnSetting('orbit')).toBe('place')
    })
    it('auto speed is the space\'s largest side / 40, the fallback while it has no size', () => {
        expect(autoSpeed(100)).toBe(2.5); expect(autoSpeed(0)).toBeNull()
        expect(resolveSpeed('auto', 2.5)).toBe(2.5); expect(resolveSpeed('auto', null)).toBe(FALLBACK_SPEED); expect(resolveSpeed(0.4, 2.5)).toBe(0.4)
    })
    it('Shift 5x faster, Alt 5x slower (Blender Walk\'s speed factor)', () => {
        expect(speedModifier({})).toBe(1); expect(speedModifier({ shift: true })).toBe(5); expect(speedModifier({ alt: true })).toBe(0.2)
        expect(speedModifier({ shift: true, alt: true })).toBe(1)
    })
    it('a wheel notch moves the same metres wherever the camera is; a trackpad tenth a tenth of it', () => {
        expect(wheelStep(1, 2.5)).toBe(2.5); expect(wheelStep(-1, 2.5)).toBe(-2.5); expect(wheelStep(0.1, 2.5)).toBeCloseTo(0.25, 9)
        expect(wheelStep(1, 2.5, 5)).toBe(12.5); expect(wheelStep(NaN, 2.5)).toBe(0)
    })
    it('a zoom drag: 100 px up is one step forward', () => {
        expect(zoomDragStep(-100, 2.5)).toBe(2.5); expect(zoomDragStep(50, 2.5)).toBe(-1.25)
    })
    it('the slide is the same per pixel in every direction: the turning point follows the pointer', () => {
        expect(slideMetresPerPixel(25, 55, 900)).toBeCloseTo((2 * 25 * Math.tan((55 * Math.PI) / 360)) / 900, 12)
        expect(slideMetresPerPixel(0, 55, 900)).toBe(0)
    })
    it('turning around a point 10 steps ahead, or where you stand', () => {
        expect(turnDistance(2.5, 'point')).toBe(25); expect(turnDistance(2.5, 'place')).toBeLessThan(0.01)
    })
    it('flying: one step per second each way, keys add up', () => {
        expect(flyVelocity(new Set(['KeyW', 'KeyD']), 2.5)).toEqual({ forward: 2.5, right: 2.5, up: 0 })
        expect(flyVelocity(new Set(['KeyW', 'KeyS', 'KeyQ']), 2.5, 5)).toEqual({ forward: 0, right: 0, up: -12.5 })
    })
})
