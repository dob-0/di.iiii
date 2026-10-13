import { describe, it, expect } from 'vitest'
import { dragLookDelta, wheelIntent, gestureDolly, touchLookDelta, clampPitch } from './walkInput.js'
import {
    DRAG_LOOK_SENSITIVITY, TRACKPAD_LOOK_SENSITIVITY, WHEEL_DOLLY_SPEED, PINCH_DOLLY_SPEED,
    TOUCH_LOOK_SENSITIVITY, WALK_PITCH_LIMIT
} from './walkModeConfig.js'

describe('mouse drag look', () => {
    it('drag right turns right, drag down looks down, from client coordinates', () => {
        const d = dragLookDelta({ x: 100, y: 100 }, { clientX: 150, clientY: 120, movementX: 0, movementY: 0 })
        expect(d.dYaw).toBeCloseTo(-50 * DRAG_LOOK_SENSITIVITY)
        expect(d.dPitch).toBeCloseTo(-20 * DRAG_LOOK_SENSITIVITY)
        expect(d.next).toEqual({ x: 150, y: 120 })
    })
    it('ignores poisoned movement deltas when the cursor moved', () => {
        const d = dragLookDelta({ x: 10, y: 10 }, { clientX: 20, clientY: 10, movementX: -1, movementY: 0 })
        expect(d.dYaw).toBeCloseTo(-10 * DRAG_LOOK_SENSITIVITY)
    })
    it('falls back to movement on the (0,0) glitch and keeps the last point', () => {
        const last = { x: 5, y: 5 }
        const d = dragLookDelta(last, { clientX: 0, clientY: 0, movementX: 30, movementY: 0 })
        expect(d.dYaw).toBeCloseTo(-30 * DRAG_LOOK_SENSITIVITY)
        expect(d.next).toBe(last)
    })
    it('first sample uses movement', () => {
        expect(dragLookDelta(null, { clientX: 9, clientY: 9, movementX: 4, movementY: 2 }).dYaw).toBeCloseTo(-4 * DRAG_LOOK_SENSITIVITY)
    })
})

describe('wheel and touchpad', () => {
    it('two-finger vertical scroll dollies, horizontal turns, page never scrolls', () => {
        const w = wheelIntent({ deltaX: 40, deltaY: -100, deltaMode: 0, ctrlKey: false })
        expect(w.dolly).toBeCloseTo(100 * WHEEL_DOLLY_SPEED)
        expect(w.dYaw).toBeCloseTo(-40 * TRACKPAD_LOOK_SENSITIVITY)
        expect(w.preventDefault).toBe(true)
    })
    it('deltaX alone is never dropped', () => {
        const w = wheelIntent({ deltaX: 25, deltaY: 0, deltaMode: 0, ctrlKey: false })
        expect(w.dYaw).not.toBe(0)
        expect(w.dolly).toBeCloseTo(0)
    })
    it('line-mode wheel is normalised', () => {
        expect(wheelIntent({ deltaX: 0, deltaY: -3, deltaMode: 1 }).dolly).toBeCloseTo(3 * 16 * WHEEL_DOLLY_SPEED)
    })
    it('pinch (ctrlKey) zooms forward on spread and never turns or lets the page zoom', () => {
        const out = wheelIntent({ deltaX: 3, deltaY: -4, deltaMode: 0, ctrlKey: true })
        expect(out.dolly).toBeCloseTo(4 * PINCH_DOLLY_SPEED)
        expect(out.dYaw).toBe(0)
        expect(out.preventDefault).toBe(true)
        expect(wheelIntent({ deltaX: 0, deltaY: 4, deltaMode: 0, ctrlKey: true }).dolly).toBeLessThan(0)
    })
    it('wheelDolly off (builder): scroll and pinch do not walk, deltaX still turns', () => {
        expect(wheelIntent({ deltaX: 10, deltaY: 50, ctrlKey: false }, { dolly: false }).dolly).toBe(0)
        expect(wheelIntent({ deltaX: 10, deltaY: 50, ctrlKey: false }, { dolly: false }).dYaw).not.toBe(0)
        expect(wheelIntent({ deltaY: 5, ctrlKey: true }, { dolly: false }).dolly).toBe(0)
    })
    it('Safari gesture scale: growing = forward, shrinking = back, bad input = 0', () => {
        expect(gestureDolly(1, 1.2)).toBeGreaterThan(0)
        expect(gestureDolly(1.2, 1)).toBeLessThan(0)
        expect(gestureDolly(0, 1)).toBe(0)
        expect(gestureDolly(1, NaN)).toBe(0)
    })
})

describe('touch look and pitch', () => {
    it('finger right/down turns right/looks down', () => {
        const d = touchLookDelta({ lastX: 0, lastY: 0 }, { clientX: 20, clientY: 10 }, TOUCH_LOOK_SENSITIVITY)
        expect(d.dYaw).toBeCloseTo(-20 * TOUCH_LOOK_SENSITIVITY)
        expect(d.dPitch).toBeCloseTo(-10 * TOUCH_LOOK_SENSITIVITY)
    })
    it('pitch is clamped short of the pole', () => {
        expect(clampPitch(9)).toBe(WALK_PITCH_LIMIT)
        expect(clampPitch(-9)).toBe(-WALK_PITCH_LIMIT)
    })
})
