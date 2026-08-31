import { describe, expect, it } from 'vitest'
import { STANDPOINT } from '../timeline/stageView.js'
import {
    PLAUSIBLE_EYE_MIN,
    STANDPOINT_EYE,
    describeEyeHeight,
    isFloorRelative,
    standpointLift
} from './xrStandpoint.js'

describe('standpointLift', () => {
    it('leaves a working headset alone', () => {
        // The case that matters most: this whole module must be a no-op
        // wherever `local-floor` is honoured, or it would start "correcting"
        // sessions that were never wrong.
        expect(standpointLift(1.6)).toBe(0)
        expect(standpointLift(1.75)).toBe(0)
        expect(standpointLift(1.42)).toBe(0)
    })

    it('does not shrink or stretch a viewer to 1.6m', () => {
        // World scale is the point of VR. A tall viewer stays tall and looks
        // DOWN at a feed composed at 1.6m — that is correct, not a defect.
        expect(standpointLift(1.93)).toBe(0)
    })

    it('leaves a seated viewer seated', () => {
        // Eyes at roughly 1.2m from the floor. A real height, honestly
        // measured, and lifting it would teleport someone upward mid-piece.
        expect(standpointLift(1.2)).toBe(0)
    })

    it('lifts the eyes to the standpoint when the space has no floor', () => {
        // A `local` reference space reports the head at its own origin, so the
        // viewer is standing on the floor of the piece looking up at it.
        expect(standpointLift(0)).toBeCloseTo(STANDPOINT_EYE, 6)
        expect(standpointLift(0.04)).toBeCloseTo(STANDPOINT_EYE - 0.04, 6)
    })

    it('lifts a badly calibrated floor by whatever it is short', () => {
        expect(standpointLift(0.5)).toBeCloseTo(1.1, 6)
    })

    it('treats a missing measurement as no floor rather than as fine', () => {
        // Failing safe means landing the viewer at the standpoint. Failing the
        // other way leaves them on the ground with nothing to explain it.
        expect(standpointLift(undefined)).toBeCloseTo(STANDPOINT_EYE, 6)
        expect(standpointLift(NaN)).toBeCloseTo(STANDPOINT_EYE, 6)
    })
})

describe('isFloorRelative', () => {
    it('draws the line above a seated viewer', () => {
        expect(isFloorRelative(PLAUSIBLE_EYE_MIN)).toBe(true)
        expect(isFloorRelative(PLAUSIBLE_EYE_MIN - 0.01)).toBe(false)
    })
})

describe('STANDPOINT_EYE', () => {
    it('is the same eye height the flat camera uses', () => {
        // Two numbers drifting apart is exactly the bug this file is fixing,
        // one level up: the headset and the browser disagreeing about height.
        expect(STANDPOINT_EYE).toBe(STANDPOINT.y)
    })
})

describe('describeEyeHeight', () => {
    it('says the floor was fine when no lift was applied', () => {
        expect(describeEyeHeight({ eyeHeight: 1.71, lift: 0 })).toBe('eye 1.71m — floor ok')
    })

    it('reports the measured height AND the correction', () => {
        // Both numbers, because the author reads this after taking the headset
        // off to find out what the headset actually said.
        expect(describeEyeHeight({ eyeHeight: 0.02, lift: 1.58 }))
            .toBe('eye 0.02m — no floor, lifted 1.58m')
    })

    it('survives being called before any session', () => {
        expect(describeEyeHeight()).toBe('eye height not measured')
    })
})
