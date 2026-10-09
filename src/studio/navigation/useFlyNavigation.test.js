import { describe, expect, it } from 'vitest'
import { FLY_CODES, SLOW_FACTOR, flyInputFor, flyParamsFor, heldWithModifiers, isChord, modifiersFrom, rightButtonUp } from './useFlyNavigation.js'

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

describe('fly latch and modifiers (pure helpers)', () => {
    it('reads Shift and Alt from the event, so a modifier held before the button counts', () => {
        expect(modifiersFrom({ shiftKey: true, altKey: false })).toEqual({ shift: true, alt: false })
        const held = heldWithModifiers(new Set(['forward', 'shift']), { shift: false, alt: true })
        expect([...held].sort()).toEqual(['alt', 'forward'])
        expect(heldWithModifiers(new Set(['forward']), { shift: true, alt: false }).has('shift')).toBe(true)
    })
    it('right button is up when the buttons mask has no bit 2; unknown proves nothing', () => {
        expect(rightButtonUp({ buttons: 0 })).toBe(true)
        expect(rightButtonUp({ buttons: 1 })).toBe(true)
        expect(rightButtonUp({ buttons: 2 })).toBe(false)
        expect(rightButtonUp({ buttons: 3 })).toBe(false)
        expect(rightButtonUp({})).toBe(false)
    })
    it('Ctrl or Cmd turns a key into a chord that fly ignores', () => {
        expect(isChord({ ctrlKey: true })).toBe(true)
        expect(isChord({ metaKey: true })).toBe(true)
        expect(isChord({})).toBe(false)
    })
})
