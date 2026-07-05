import { describe, expect, it } from 'vitest'
import { flyVertFromStick, FLY_STICK_DEADZONE } from './xrFlyControl.js'

// These tests encode a REAL-HARDWARE verification (headset, 2026-07-05):
// the xr-standard-thumbstick yAxis is NEGATIVE when pushed up. If a change
// makes these fail, the fix is wrong unless it was re-tested on a headset —
// this sign has already been flipped once on a false "verified" claim.
describe('flyVertFromStick', () => {
    it('push up (negative yAxis) ascends (positive vert)', () => {
        expect(flyVertFromStick(-1)).toBe(1)
        expect(flyVertFromStick(-0.5)).toBe(0.5)
    })

    it('push down (positive yAxis) descends (negative vert)', () => {
        expect(flyVertFromStick(1)).toBe(-1)
        expect(flyVertFromStick(0.5)).toBe(-0.5)
    })

    it('ignores drift inside the deadzone', () => {
        expect(flyVertFromStick(0)).toBe(0)
        expect(flyVertFromStick(FLY_STICK_DEADZONE)).toBe(0)
        expect(flyVertFromStick(-FLY_STICK_DEADZONE)).toBe(0)
    })
})
