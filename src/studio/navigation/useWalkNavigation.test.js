import { describe, expect, it } from 'vitest'
import { flyStart, flyStep } from '../../project/viewport/flyMotion.js'
import { EYE_HEIGHT } from '../../components/walkModeConfig.js'
import {
    WALK_GRAVITY, WALK_PREFS, gravityStep, isWalkToggle, lookAfter, nextWalkMode, walkInput, walkKeyAction, walkLook, walkParams,
} from './useWalkNavigation.js'

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

// Owner 2026-10-13: "can the Studio too have the buttons Walk / Fly?" Fly = the walk above (gravity off); Walk = gravity on, the
// camera held at the platform's eye height above the floor (y 0, as the visitor walk), E/Q do nothing, Tab switches (Blender).
describe('walk with gravity, and Tab between Walk and Fly', () => {
    it('Tab switches Walk <-> Fly, and Tab is the only toggle key', () => {
        expect(nextWalkMode('walk')).toBe('fly')
        expect(nextWalkMode('fly')).toBe('walk')
        expect(walkKeyAction('Tab', 'walk')).toBe('toggle')
        expect(walkKeyAction('Tab', 'fly')).toBe('toggle')
        expect(walkKeyAction('Escape', 'walk')).toBe('end')
        expect(walkKeyAction('KeyX', 'fly')).toBe(null)
    })
    it('E/Q do nothing in Walk and go up/down in Fly; W A S D move in both', () => {
        expect(walkKeyAction('KeyE', 'walk')).toBe(null)
        expect(walkKeyAction('KeyQ', 'walk')).toBe(null)
        expect(walkKeyAction('KeyE', 'fly')).toBe('up')
        expect(walkKeyAction('KeyQ', 'fly')).toBe('down')
        for (const m of ['walk', 'fly']) expect(['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((c) => walkKeyAction(c, m))).toEqual(['forward', 'left', 'back', 'right'])
    })
    it('the eye height is the platform constant, 1.6 m, over the floor at y 0', () => {
        expect(WALK_GRAVITY.eyeHeight).toBe(EYE_HEIGHT)
        expect(EYE_HEIGHT).toBe(1.6)
        expect(WALK_GRAVITY.floorY).toBe(0)
    })
    it('from 6.5 m the camera falls 4.9 m and lands on eye height in 1 s (g = 9.80665), at any frame rate', () => {
        const fall = (fps) => {
            let s = { y: 6.5, vy: 0 }, t = 0
            while (s.y > EYE_HEIGHT && t < 3) { s = gravityStep(s, 1 / fps); t += 1 / fps }
            return { s, t }
        }
        const a = fall(30), b = fall(144)
        expect(a.s).toEqual({ y: 1.6, vy: 0 }); expect(b.s).toEqual({ y: 1.6, vy: 0 })
        // sqrt(2 * 4.9 / 9.80665) = 0.9997 s
        expect(a.t).toBeGreaterThan(0.99); expect(a.t).toBeLessThan(1.04)
        expect(b.t).toBeGreaterThan(0.99); expect(b.t).toBeLessThan(1.01)
        const half = gravityStep({ y: 10, vy: 0 }, 0.1)
        expect(half.y).toBeCloseTo(10 - 0.5 * 9.80665 * 0.01, 9)
        expect(half.vy).toBeCloseTo(-0.980665, 9)
    })
    it('below or at eye height the camera stands at eye height, at rest; a bad frame does not move it', () => {
        expect(gravityStep({ y: 0.2, vy: -3 }, 0.016)).toEqual({ y: 1.6, vy: 0 })
        expect(gravityStep({ y: 1.6, vy: 0 }, 0.016)).toEqual({ y: 1.6, vy: 0 })
        expect(gravityStep({ y: 4, vy: 0 }, NaN)).toEqual({ y: 4, vy: 0 })
        expect(gravityStep({ y: 4, vy: 0 }, 5).y).toBeCloseTo(4 - 0.5 * 9.80665 * 0.01, 9) // a stall counts as 0.1 s
        expect(gravityStep({ y: 4, vy: 0 }, 0.1, { floorY: 3 })).toEqual({ y: 4.6, vy: 0 })
    })
    it('Walk moves on the level along the heading even when looking down; Fly moves along the look', () => {
        const down = -1.2
        expect(walkLook('walk', 0, down)).toEqual([-0, 0, -1])
        const f = walkLook('fly', 0, down)
        expect(f[1]).toBeCloseTo(Math.sin(down), 9)
        let s = flyStart([0, 1.6, 0], walkParams(new Set()))
        for (let i = 0; i < 100; i++) s = flyStep(s, walkInput(new Set(['forward']), walkLook('walk', 0, down)), 0.01, walkParams(new Set(['forward'])))
        expect(s.pos[1]).toBeCloseTo(1.6, 9); expect(-s.pos[2]).toBeGreaterThan(2.2)
    })
})
