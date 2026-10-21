import { describe, expect, it } from 'vitest'
import { needsOrientationPermission, screenAngle, tiltFromOrientation } from './tiltReading.js'

const rest = { beta: 50, gamma: 0 }

describe('tiltFromOrientation', () => {
    it('the pose at the first reading is level, whatever angle the phone was held at', () => {
        expect(tiltFromOrientation({ beta: 50, gamma: 0 }, rest)).toEqual({ x: 0, y: 0 })
    })

    it('portrait: the right edge dipping is +x, the top edge dipping is +y, Range degrees is 1', () => {
        expect(tiltFromOrientation({ beta: 50, gamma: 15 }, rest)).toEqual({ x: 0.5, y: 0 })
        expect(tiltFromOrientation({ beta: 35, gamma: 0 }, rest)).toEqual({ x: 0, y: 0.5 })
        expect(tiltFromOrientation({ beta: 65, gamma: -30 }, rest)).toEqual({ x: -1, y: -0.5 })
    })

    it('clamps to -1..1 and honours a wider Range', () => {
        expect(tiltFromOrientation({ beta: 50, gamma: 80 }, rest)).toEqual({ x: 1, y: 0 })
        expect(tiltFromOrientation({ beta: 50, gamma: 45 }, rest, { range: 90 })).toEqual({ x: 0.5, y: 0 })
        // a nonsense Range falls back to 30 rather than dividing by zero
        expect(tiltFromOrientation({ beta: 50, gamma: 15 }, rest, { range: 0 })).toEqual({ x: 0.5, y: 0 })
    })

    it('landscape, top edge on the left (angle 90): the axes turn with the screen', () => {
        // top edge rising (beta up) = the screen's right edge dipping
        expect(tiltFromOrientation({ beta: 65, gamma: 0 }, rest, { angle: 90 })).toEqual({ x: 0.5, y: 0 })
        // right edge dipping (gamma up) = the screen's top edge dipping
        expect(tiltFromOrientation({ beta: 50, gamma: 15 }, rest, { angle: 90 })).toEqual({ x: 0, y: 0.5 })
        expect(tiltFromOrientation({ beta: 65, gamma: 0 }, rest, { angle: 270 })).toEqual({ x: -0.5, y: 0 })
        expect(tiltFromOrientation({ beta: 50, gamma: 15 }, rest, { angle: 180 })).toEqual({ x: -0.5, y: 0 })
    })

    it('a missing reading answers null, not NaN', () => {
        expect(tiltFromOrientation({ beta: null, gamma: undefined }, rest)).toBeNull()
    })
})

describe('the browser around it', () => {
    it('screenAngle reads screen.orientation, then window.orientation, then 0', () => {
        expect(screenAngle({ screen: { orientation: { angle: 90 } } })).toBe(90)
        expect(screenAngle({ orientation: -90 })).toBe(-90)
        expect(screenAngle({})).toBe(0)
    })

    it('needsOrientationPermission is true only where requestPermission exists (iOS 13+)', () => {
        expect(needsOrientationPermission({ DeviceOrientationEvent: { requestPermission: () => {} } })).toBe(true)
        expect(needsOrientationPermission({ DeviceOrientationEvent: function DeviceOrientationEvent() {} })).toBe(false)
        expect(needsOrientationPermission({})).toBe(false)
    })
})
