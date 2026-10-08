import { describe, expect, it } from 'vitest'
import { FLY_CODES, SLOW_FACTOR, flyInputFor, flyParamsFor } from './useFlyNavigation.js'

describe('fly input mapping (Blender / Unreal / Unity scheme)', () => {
    it('maps W A S D to move, E / Q to up / down, nothing else', () => {
        expect(FLY_CODES).toEqual({ KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', KeyE: 'up', KeyQ: 'down' })
    })
    it('builds the flyStep input from the keys held', () => {
        const i = flyInputFor(new Set(['forward', 'shift']), [0, 0, -1], 2)
        expect(i).toMatchObject({ forward: true, back: false, left: false, right: false, up: false, down: false, sprint: true, wheel: 2, look: [0, 0, -1] })
    })
    it('Shift is the speed factor, Alt is the slow factor, Shift wins, none = 1', () => {
        expect(flyParamsFor(new Set(['shift']), { baseSpeed: 10, factor: 4 })).toEqual({ baseSpeed: 10, sprintFactor: 4 })
        expect(flyParamsFor(new Set(['alt']), { baseSpeed: 10, factor: 4 })).toEqual({ baseSpeed: 10, sprintFactor: SLOW_FACTOR })
        expect(flyParamsFor(new Set(['shift', 'alt']), { baseSpeed: 10, factor: 4 }).sprintFactor).toBe(4)
        expect(flyParamsFor(new Set(), { baseSpeed: 10, factor: 4 }).sprintFactor).toBe(1)
    })
})
