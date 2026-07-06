import { describe, expect, it } from 'vitest'
import { flyVertFromStick, moveFromStick, xrTurnSpeed, FLY_STICK_DEADZONE, MOVE_STICK_DEADZONE } from './xrFlyControl.js'

// These tests encode a REAL-HARDWARE verification (headset, 2026-07-05,
// confirmed independently 3 times since): the xr-standard-thumbstick yAxis
// is NEGATIVE when pushed up. A 2026-07-06 report claiming this had flipped
// arrived in the same round as an impossible report (both turn signs AND
// both fly signs called "still wrong"), immediately after a debug-only
// commit with zero functional change -- treated as an unreliable test round
// and reverted. If a change makes these fail, the fix is wrong unless it
// was re-tested deliberately on a headset.
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

// REAL-HARDWARE TRUTH (headset, 2026-07-06): the library's own right-stick
// smooth-turn logic turned the view backwards (push left turned right,
// the original VR report). Negating the speed passed to it flips the turn
// direction -- geometrically verified. A follow-up "still wrong" report
// arrived bundled with an impossible one (see flyVertFromStick above) and
// was treated as an unreliable test round rather than re-flipped again.
// Do not change without a fresh, deliberate re-test on a physical headset.
describe('xrTurnSpeed', () => {
    it('inverts the base turn speed to counter the library\'s backwards turn direction', () => {
        expect(xrTurnSpeed(1.6)).toBe(-1.6)
        expect(xrTurnSpeed(-1.6)).toBe(1.6)
    })
})
