// Move 1 FROZEN. The numbers below were produced by running the code once on 2026-10-14 (the standard move, PR #919, dev 38d22dcf)
// and written down as literals. If one fails you changed Move 1: put it back, and add Move 2 in moves.js instead.
// Changed ONLY by the owner's word: 2026-10-16 17:3x "make everywhere move everywhere in di where you stand mode by def" —
// the default turn is 'place' (where you stand), and junk falls back to it. Every number of the move itself is unchanged.
import { describe, expect, it } from 'vitest'
import {
    AUTO_SPEED_DIVISOR, FALLBACK_SPEED, IN_PLACE_DISTANCE, MAX_SPEED, MIN_SPEED, MOVE_1_CAMERA, SPEED_FACTOR, TURN_DISTANCE_STEPS,
    TURN_MODES, ZOOM_DRAG_PIXELS_PER_STEP, autoSpeed, flyVelocity, resolveSpeed, slideMetresPerPixel, speedModifier, turnDistance,
    wheelStep, zoomDragStep, normalizeSpeedSetting, normalizeTurnSetting,
} from './freeMove.js'
import { CC_ACTION, DEFAULT_NAVIGATION_PRESET, controlBindingsFor, getNavigationPreset } from './mappings.js'
import { DEFAULT_MOVE_ID, MOVES, moveFor, normalizeMoveId } from './moves.js'
import { MOVE_STORAGE_KEY, getMovePreference, getSpeedPreference, getTurnPreference, resetNavigationPreferenceMemory } from './preference.js'

const WHY = "Move 1 is the owner's movement (2026-10-14): do not change it; add Move 2 in moves.js"
const is = (actual, expected) => expect(actual, WHY).toBe(expected)
const near = (actual, expected) => expect(actual, WHY).toBeCloseTo(expected, 9)

describe("Move 1 golden: the owner's movement, frozen", () => {
    it('is the one named move and the default; junk becomes it', () => {
        expect(MOVES, WHY).toEqual([{ id: 'move-1', label: 'Move 1', since: '2026-10-14', about: 'Same speed in every direction · Auto speed from the size of the place' }])
        expect(Object.isFrozen(MOVES), WHY).toBe(true)
        is(DEFAULT_MOVE_ID, 'move-1')
        is(normalizeMoveId('move-9'), 'move-1'); is(normalizeMoveId(null), 'move-1'); is(moveFor('junk').id, 'move-1')
        is(MOVE_STORAGE_KEY, 'di.studio.navigation.move')
    })

    it('defaults: preset studio, speed auto, turn place (where you stand, owner 2026-10-16), move 1', () => {
        resetNavigationPreferenceMemory()
        try { window.localStorage.clear() } catch { /* no storage */ }
        is(DEFAULT_NAVIGATION_PRESET, 'studio'); is(getSpeedPreference(), 'auto'); is(getTurnPreference(), 'place'); is(getMovePreference(), 'move-1')
    })

    it('constants', () => {
        is(SPEED_FACTOR, 5); is(AUTO_SPEED_DIVISOR, 40); is(TURN_DISTANCE_STEPS, 10); is(ZOOM_DRAG_PIXELS_PER_STEP, 100)
        is(IN_PLACE_DISTANCE, 0.001); is(FALLBACK_SPEED, 1); is(MIN_SPEED, 0.001); is(MAX_SPEED, 10000)
        expect(TURN_MODES, WHY).toEqual(['point', 'place'])
    })

    it('auto speed is the largest side / 40; clamps; the fallback while the place has no size', () => {
        const table = [[1, 0.025], [10, 0.25], [40, 1], [100, 2.5], [250, 6.25], [1000, 25]]
        for (const [side, speed] of table) near(autoSpeed(side), speed)
        is(autoSpeed(0), null); is(autoSpeed(NaN), null)
        is(resolveSpeed('auto', null), 1); is(resolveSpeed('auto', 2.5), 2.5); is(resolveSpeed(0.4, 2.5), 0.4)
        is(normalizeSpeedSetting(0.0001), 0.001); is(normalizeSpeedSetting(1e9), 10000); is(normalizeSpeedSetting('x'), 'auto')
        is(normalizeTurnSetting('orbit'), 'place'); is(normalizeTurnSetting('place'), 'place')
    })

    it('Alt/Shift factors', () => {
        is(speedModifier({}), 1); is(speedModifier({ shift: true }), 5); is(speedModifier({ alt: true }), 0.2); is(speedModifier({ shift: true, alt: true }), 1)
    })

    it('a notch in equals a notch out; Shift and trackpad steps', () => {
        for (const speed of [0.25, 2.5, 5, 25]) {
            for (const n of [1, 3, 12]) near(wheelStep(n, speed), -wheelStep(-n, speed))
        }
        near(wheelStep(1, 2.5), 2.5); near(wheelStep(-12, 5), -60); near(wheelStep(1, 2.5, 5), 12.5); near(wheelStep(0.1, 2.5), 0.25); is(wheelStep(NaN, 2.5), 0)
    })

    it('turning point, zoom drag and slide', () => {
        is(turnDistance(2.5, 'point'), 25); is(turnDistance(5, 'point'), 50); is(turnDistance(2.5, 'place'), 0.001)
        near(zoomDragStep(-100, 2.5), 2.5); near(zoomDragStep(50, 2.5), -1.25); near(zoomDragStep(-250, 4, 5), 50); is(zoomDragStep(NaN, 2.5), 0)
        near(slideMetresPerPixel(25, 55, 900), 0.028920391697319237)
        near(slideMetresPerPixel(2.5, 50, 1080), 0.002158831750717586)
        near(slideMetresPerPixel(69, 60, 720), 0.11065880159467827)
        is(slideMetresPerPixel(0, 55, 900), 0)
    })

    it('fly speed: one step a second each way', () => {
        expect(flyVelocity(new Set(['KeyW', 'KeyD']), 2.5), WHY).toEqual({ forward: 2.5, right: 2.5, up: 0 })
        expect(flyVelocity(new Set(['KeyS', 'KeyA', 'KeyE']), 5, 5), WHY).toEqual({ forward: -25, right: -25, up: 25 })
        expect(flyVelocity(new Set(['KeyW', 'KeyS']), 3), WHY).toEqual({ forward: 0, right: 0, up: 0 })
    })

    it("the 'studio' mouse map handed to camera-controls", () => {
        expect(controlBindingsFor('studio'), WHY).toEqual({
            mouseButtons: { left: CC_ACTION.ROTATE, middle: CC_ACTION.DOLLY, right: CC_ACTION.TRUCK, wheel: CC_ACTION.NONE },
            touches: { one: CC_ACTION.ROTATE, two: CC_ACTION.TOUCH_DOLLY_TRUCK },
        })
        expect(controlBindingsFor('studio'), WHY).toEqual({ mouseButtons: { left: 1, middle: 16, right: 2, wheel: 0 }, touches: { one: 1, two: 4096 } })
    })

    it('every numeric option camera-controls gets', () => {
        const studio = getNavigationPreset('studio')
        is(studio.smoothTime, 0.25); is(studio.draggingSmoothTime, 0.125); is(studio.modifierGestures, false); is(studio.focusOnDoubleClick, true)
        expect(MOVE_1_CAMERA, WHY).toEqual({ rotateSpeed: 1, infinityDolly: true, minDistance: 0.0005, maxDistance: Infinity })
        expect(Object.isFrozen(MOVE_1_CAMERA), WHY).toBe(true)
    })
})
