import { describe, expect, it } from 'vitest'
import { flyVertFromStick, moveFromStick, FLY_STICK_DEADZONE, MOVE_STICK_DEADZONE } from './xrFlyControl.js'

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

describe('moveFromStick', () => {
    it('push up (negative yAxis) moves forward (+)', () => {
        expect(moveFromStick(0, -1)).toEqual({ forward: 1, strafe: 0 })
    })

    it('push left (negative xAxis) strafes left (-)', () => {
        expect(moveFromStick(-1, 0)).toEqual({ forward: 0, strafe: -1 })
    })

    it('push right (positive xAxis) strafes right (+)', () => {
        expect(moveFromStick(1, 0)).toEqual({ forward: 0, strafe: 1 })
    })

    it('ignores drift inside the deadzone, passes a live axis through whole', () => {
        expect(moveFromStick(MOVE_STICK_DEADZONE, MOVE_STICK_DEADZONE)).toEqual({ forward: 0, strafe: 0 })
        expect(moveFromStick(0.05, -0.8)).toEqual({ forward: 0.8, strafe: 0.05 })
    })
})
