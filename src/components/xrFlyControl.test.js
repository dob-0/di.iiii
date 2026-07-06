import { describe, expect, it } from 'vitest'
import { flyVertFromStick, moveFromStick, xrTurnSpeed, FLY_STICK_DEADZONE, MOVE_STICK_DEADZONE } from './xrFlyControl.js'

// These tests encode a REAL-HARDWARE verification (headset, 2026-07-07):
// the 2026-07-05 claim (yAxis negative when pushed up) was re-tested live
// and found backwards — push up descended. xr-standard-thumbstick yAxis is
// POSITIVE when pushed up on this device. If a change makes these fail, the
// fix is wrong unless it was re-tested on a headset — this sign has already
// been flipped multiple times on assumption/false "verified" claims.
describe('flyVertFromStick', () => {
    it('push up (positive yAxis) ascends (positive vert)', () => {
        expect(flyVertFromStick(1)).toBe(1)
        expect(flyVertFromStick(0.5)).toBe(0.5)
    })

    it('push down (negative yAxis) descends (negative vert)', () => {
        expect(flyVertFromStick(-1)).toBe(-1)
        expect(flyVertFromStick(-0.5)).toBe(-0.5)
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

    // Hardware truth (headset, 2026-07-06): the 2026-07-05 session's claim
    // that push-left reads as POSITIVE xAxis on-device was never actually
    // re-verified and was backwards on real hardware — confirmed the strafe
    // came out mirrored (push left moved right). This device follows the
    // standard Gamepad-API convention (push left = negative xAxis). Re-test
    // on a physical headset before "fixing" this sign again.
    it('push left (negative xAxis, standard convention) strafes left (-)', () => {
        expect(moveFromStick(-1, 0)).toEqual({ forward: 0, strafe: -1 })
    })

    it('push right (positive xAxis, standard convention) strafes right (+)', () => {
        expect(moveFromStick(1, 0)).toEqual({ forward: 0, strafe: 1 })
    })

    it('ignores drift inside the deadzone, passes a live axis through whole', () => {
        expect(moveFromStick(MOVE_STICK_DEADZONE, MOVE_STICK_DEADZONE)).toEqual({ forward: 0, strafe: 0 })
        expect(moveFromStick(0.05, -0.8)).toEqual({ forward: 0.8, strafe: 0.05 })
    })
})

// REAL-HARDWARE TRUTH (headset, 2026-07-07): the 2026-07-06 negation
// (guessing the library's default turn direction was backwards) was
// re-tested live and reported still wrong either way — this axis has NOT
// been conclusively resolved by description alone (a live raw-axis readout
// was added in LiveProjectScene.jsx to get an objective reading next time).
// Currently reverted to the library's own unmodified direction. Do not
// change without re-testing on a physical headset.
describe('xrTurnSpeed', () => {
    it('currently passes the base turn speed through unchanged (library default)', () => {
        expect(xrTurnSpeed(1.6)).toBe(1.6)
        expect(xrTurnSpeed(-1.6)).toBe(-1.6)
    })
})
