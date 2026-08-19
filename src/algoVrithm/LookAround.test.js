import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PITCH_LIMIT, clampPitch } from './LookAround.jsx'

describe('LookAround pitch clamp', () => {
    it('stops short of straight up and straight down', () => {
        // At exactly ±90° the camera's up-vector is ambiguous and the view
        // rolls — gimbal flip. The limit exists to never reach it.
        expect(PITCH_LIMIT).toBeLessThan(Math.PI / 2)
        expect(THREE.MathUtils.radToDeg(PITCH_LIMIT)).toBeCloseTo(85, 5)
    })

    it('clamps beyond the limit in both directions', () => {
        expect(clampPitch(Math.PI)).toBe(PITCH_LIMIT)
        expect(clampPitch(-Math.PI)).toBe(-PITCH_LIMIT)
    })

    it('leaves ordinary angles untouched', () => {
        expect(clampPitch(0)).toBe(0)
        expect(clampPitch(0.5)).toBe(0.5)
        expect(clampPitch(-0.5)).toBe(-0.5)
    })
})
