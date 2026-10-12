import { describe, expect, it } from 'vitest'
import { flyStart, flyStep } from '../../project/viewport/flyMotion.js'
import { WALK_PREFS, isWalkToggle, lookAfter, walkInput, walkParams } from './useWalkNavigation.js'

describe('walk: Blender\'s Walk Navigation with the owner\'s preferences (2026-10-12)', () => {
    it('Shift+` toggles, nothing else does', () => {
        expect(isWalkToggle({ code: 'Backquote', shiftKey: true })).toBe(true)
        expect(isWalkToggle({ code: 'Backquote', shiftKey: false })).toBe(false)
        expect(isWalkToggle({ code: 'Backquote', shiftKey: true, ctrlKey: true })).toBe(false)
    })
    it('walks at 2.5 m/s, Shift x5 = 12.5 m/s, Alt slower; the wheel changes nothing', () => {
        const look = [0, 0, -1]
        let s = flyStart([0, 0, 0], walkParams(new Set()))
        for (let i = 0; i < 100; i++) s = flyStep(s, walkInput(new Set(['forward']), look), 0.01, walkParams(new Set(['forward'])))
        expect(-s.pos[2]).toBeGreaterThan(2.5 * 0.9); expect(-s.pos[2]).toBeLessThan(2.5)  // 1 s minus the ramp
        let f = flyStart([0, 0, 0], walkParams(new Set()))
        for (let i = 0; i < 100; i++) f = flyStep(f, walkInput(new Set(['forward', 'shift']), look), 0.01, walkParams(new Set(['forward', 'shift'])))
        expect(-f.pos[2]).toBeGreaterThan(12.5 * 0.9)
        expect(walkParams(new Set(['alt'])).sprintFactor).toBe(WALK_PREFS.slowFactor)
        expect(walkParams(new Set(['shift', 'alt'])).sprintFactor).toBe(5)
        expect(walkParams(new Set()).wheelStep).toBe(1)
    })
    it('the mouse looks at 0.4 deg per px (his Orbit Sensitivity) and the pitch never flips over', () => {
        const a = lookAfter({ yaw: 0, pitch: 0 }, 100, 0)
        expect(a.yaw).toBeCloseTo(-40 * Math.PI / 180, 6)
        const b = lookAfter({ yaw: 0, pitch: 0 }, 0, -10000)
        expect(b.pitch).toBeCloseTo(WALK_PREFS.pitchLimit, 6)
    })
    it('Q/E move along the world up axis whatever the look', () => {
        let s = flyStart([0, 0, 0], walkParams(new Set()))
        for (let i = 0; i < 100; i++) s = flyStep(s, walkInput(new Set(['up']), [0, -0.7, -0.7]), 0.01, walkParams(new Set()))
        expect(s.pos[1]).toBeGreaterThan(2); expect(Math.abs(s.pos[2])).toBeLessThan(1e-6)
    })
})
