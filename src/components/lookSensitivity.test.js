import { describe, expect, it } from 'vitest'
import {
    GAME_PRESETS,
    cmPer360,
    convertSens,
    countsPerMovementUnit,
    degreesPerCount,
    edpi,
    radiansPerMovementUnit,
    sensForCmPer360
} from './lookSensitivity.js'
import { DEFAULT_LOOK_DPI, DEFAULT_LOOK_SENS, FLY_PITCH_LIMIT, WALK_PITCH_LIMIT } from './walkModeConfig.js'

// Published pairs every sensitivity converter reproduces (formula:
// cm/360 = 360 / (sens × yaw × DPI) × 2.54; yaw table in lookSensitivity.js).
describe('cm/360 against published pairs', () => {
    it('CS2 sens 1 at 800 DPI is 51.95 cm/360', () => {
        expect(cmPer360(1, GAME_PRESETS.cs2.yaw, 800)).toBeCloseTo(51.95, 2)
    })
    it('CS2 sens 2 at 400 DPI equals sens 1 at 800 DPI (same eDPI, same turn)', () => {
        expect(cmPer360(2, 0.022, 400)).toBeCloseTo(cmPer360(1, 0.022, 800), 10)
        expect(edpi(2, 400)).toBe(800)
    })
    it('800 eDPI is 52 cm, 1000 eDPI 42 cm, 1236 eDPI 34 cm (CS2 guides, 2026)', () => {
        expect(Math.round(cmPer360(1, 0.022, 800))).toBe(52)
        expect(Math.round(cmPer360(1, 0.022, 1000))).toBe(42)
        expect(Math.round(cmPer360(1, 0.022, 1236))).toBe(34)
    })
    it('Valorant sens = CS2 sens ÷ 3.18 (0.07 / 0.022)', () => {
        expect(convertSens(1.6, GAME_PRESETS.cs2.yaw, GAME_PRESETS.valorant.yaw)).toBeCloseTo(0.503, 3)
        expect(cmPer360(0.503, 0.07, 800)).toBeCloseTo(cmPer360(1.6, 0.022, 800), 1)
    })
    it('Overwatch 2 sens = CS2 sens × 3.33 (0.022 / 0.0066)', () => {
        expect(convertSens(1.5, 0.022, GAME_PRESETS.overwatch.yaw)).toBeCloseTo(5, 6)
    })
    it('Fortnite config 0.064 (6.4% slider) ≈ CS2 1.62', () => {
        expect(convertSens(0.064, GAME_PRESETS.fortnite.yaw, 0.022)).toBeCloseTo(1.616, 2)
    })
    it('sensForCmPer360 inverts cmPer360', () => {
        for (const [cm, yaw, dpi] of [[32, 0.022, 800], [45, 0.07, 1600], [25, 0.0066, 400]]) {
            expect(cmPer360(sensForCmPer360(cm, yaw, dpi), yaw, dpi)).toBeCloseTo(cm, 9)
        }
        expect(Number.isNaN(sensForCmPer360(0, 0.022, 800))).toBe(true)
    })
    it('degrees per count is sens × yaw', () => {
        expect(degreesPerCount(1.25, 0.022)).toBeCloseTo(0.0275, 12)
    })
})

describe('the walk default', () => {
    it('sits in the 35–45 cm/360 band for walking a hall', () => {
        const cm = cmPer360(DEFAULT_LOOK_SENS, GAME_PRESETS.cs2.yaw, DEFAULT_LOOK_DPI)
        expect(cm).toBeGreaterThanOrEqual(35)
        expect(cm).toBeLessThanOrEqual(45)
        expect(cm).toBeCloseTo(41.56, 2)
    })
})

describe('movementX units → counts', () => {
    it('raw lock: one movementX unit is one count', () => {
        expect(countsPerMovementUnit({ raw: true, dpr: 1.5 })).toBe(1)
    })
    it('plain lock: counts = movementX × DPR (measured on Chromium 153 X11 at DPR 1.5)', () => {
        expect(countsPerMovementUnit({ raw: false, dpr: 1.5 })).toBe(1.5)
        expect(countsPerMovementUnit({ raw: false, dpr: 0 })).toBe(1)
    })
    it('a full 360 of counts at the default turns exactly 2π', () => {
        const counts = 360 / (1.25 * 0.022) // 13 090.9 counts = 41.56 cm at 800 DPI
        const perUnit = radiansPerMovementUnit({ sens: 1.25, yaw: 0.022, raw: false, dpr: 1.5 })
        expect((counts / 1.5) * perUnit).toBeCloseTo(2 * Math.PI, 10)
    })
})

describe('pitch limits', () => {
    it('walk stops at 89° (Source/CS2 cl_pitchdown), fly just past it, neither at the pole', () => {
        expect((WALK_PITCH_LIMIT * 180) / Math.PI).toBeCloseTo(89, 10)
        expect(FLY_PITCH_LIMIT).toBeGreaterThan(WALK_PITCH_LIMIT)
        expect(FLY_PITCH_LIMIT).toBeLessThan(Math.PI / 2)
    })
})
