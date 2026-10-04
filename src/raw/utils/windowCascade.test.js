import { describe, expect, it } from 'vitest'
import { cascadeCoincidentWindows, pickEscapeWindow } from './windowCascade.js'

// NOPA audit F8 (2026-10-02): Gear, People, To do and Budget each opened on
// the same saved spot, one exactly on top of the next, so only the last one
// could be seen and nothing said three more were under it.
describe('cascadeCoincidentWindows', () => {
    it('offsets a window that would open exactly on another, one step each', () => {
        const out = cascadeCoincidentWindows([
            { id: 'gear', x: 63, y: 305 },
            { id: 'people', x: 63, y: 305 },
            { id: 'todo', x: 63, y: 305 }
        ])
        expect(out.get('gear')).toEqual({ x: 63, y: 305 })
        expect(out.get('people')).toEqual({ x: 95, y: 337 })
        expect(out.get('todo')).toEqual({ x: 127, y: 369 })
    })

    it('leaves windows that are apart where they are', () => {
        const out = cascadeCoincidentWindows([
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 400, y: 0 }
        ])
        expect(out.get('a')).toEqual({ x: 0, y: 0 })
        expect(out.get('b')).toEqual({ x: 400, y: 0 })
    })

    it('measures the step on screen: world windows step 32px whatever the zoom', () => {
        const out = cascadeCoincidentWindows([
            { id: 'a', x: 100, y: 100, inWorld: true },
            { id: 'b', x: 102, y: 101, inWorld: true }
        ], { zoom: 0.5 })
        expect(out.get('b')).toEqual({ x: 166, y: 165 })
    })

    it('never compares a pinned (screen) window with a world one', () => {
        const out = cascadeCoincidentWindows([
            { id: 'a', x: 100, y: 100, inWorld: true },
            { id: 'b', x: 100, y: 100, inWorld: false }
        ], { zoom: 1 })
        expect(out.get('b')).toEqual({ x: 100, y: 100 })
    })
})

describe('pickEscapeWindow', () => {
    const windows = [
        { id: 'scene', zIndex: 9, minimized: false },
        { id: 'gear', zIndex: 7, minimized: false },
        { id: 'budget', zIndex: 8, minimized: false }
    ]

    it('closes the front-most window the person opened or raised', () => {
        expect(pickEscapeWindow(windows, ['gear', 'budget'])).toBe('budget')
    })

    it('leaves the arrangement the project opened with alone', () => {
        expect(pickEscapeWindow(windows, [])).toBeNull()
    })

    it('skips a minimized window', () => {
        expect(pickEscapeWindow([{ id: 'a', zIndex: 9, minimized: true }], ['a'])).toBeNull()
    })
})
