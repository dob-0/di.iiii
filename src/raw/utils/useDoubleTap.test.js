import { describe, expect, it } from 'vitest'
import { createTapTracker, DOUBLE_TAP_MAX_INTERVAL_MS, DOUBLE_TAP_MAX_RADIUS_PX, TAP_MOVE_TOLERANCE_PX } from './useDoubleTap.js'

const touch = (x, y) => ({ pointerType: 'touch', clientX: x, clientY: y })
const mouse = (x, y) => ({ pointerType: 'mouse', clientX: x, clientY: y })

const clock = () => {
    let t = 0
    return { now: () => t, tick: (ms) => { t += ms } }
}

const tap = (tracker, event, c, holdMs = 30) => {
    tracker.down(event)
    c.tick(holdMs)
    return tracker.up(event)
}

describe('createTapTracker — the double-tap the browser would not give us', () => {
    it('two quick taps in place complete on the second up', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        expect(tap(t, touch(100, 100), c)).toBe(false)
        c.tick(120)
        expect(tap(t, touch(104, 98), c)).toBe(true)
    })

    it('a slow second tap is two single taps', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        tap(t, touch(100, 100), c)
        c.tick(DOUBLE_TAP_MAX_INTERVAL_MS + 50)
        expect(tap(t, touch(100, 100), c)).toBe(false)
    })

    it('a far second tap is two different taps', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        tap(t, touch(100, 100), c)
        c.tick(100)
        expect(tap(t, touch(100 + DOUBLE_TAP_MAX_RADIUS_PX + 10, 100), c)).toBe(false)
    })

    it('a slid finger is a pan, never half of a double-tap', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        t.down(touch(100, 100))
        c.tick(40)
        expect(t.up(touch(100 + TAP_MOVE_TOLERANCE_PX + 5, 100))).toBe(false)
        c.tick(80)
        // the slide did not count, so this pair starts fresh
        expect(tap(t, touch(100, 100), c)).toBe(false)
        c.tick(80)
        expect(tap(t, touch(100, 100), c)).toBe(true)
    })

    it('a second finger poisons the gesture — a pinch is not a tap', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        t.down(touch(100, 100))
        t.down(touch(140, 100))
        expect(t.up(touch(100, 100))).toBe(false)
        expect(t.up(touch(140, 100))).toBe(false)
        // and the machine recovers for an honest pair afterwards
        c.tick(50)
        tap(t, touch(100, 100), c)
        c.tick(80)
        expect(tap(t, touch(100, 100), c)).toBe(true)
    })

    it('mouse pointers are ignored — the native dblclick path owns them', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        expect(tap(t, mouse(100, 100), c)).toBe(false)
        c.tick(50)
        expect(tap(t, mouse(100, 100), c)).toBe(false)
    })

    it('justFired() covers the Chromium double-fire window, then clears', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        tap(t, touch(100, 100), c)
        c.tick(80)
        tap(t, touch(100, 100), c)
        expect(t.justFired()).toBe(true)
        c.tick(800)
        expect(t.justFired()).toBe(false)
    })

    it('a triple tap fires once, not twice', () => {
        const c = clock()
        const t = createTapTracker(c.now)
        tap(t, touch(100, 100), c)
        c.tick(80)
        expect(tap(t, touch(100, 100), c)).toBe(true)
        c.tick(80)
        expect(tap(t, touch(100, 100), c)).toBe(false)
    })
})
