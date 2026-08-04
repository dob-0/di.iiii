import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PANEL_TOGGLE_KEY, shouldTogglePanels, usePanelToggle } from './usePanelToggle.js'

const keydown = (key, overrides = {}) => new KeyboardEvent('keydown', { key, ...overrides })

const press = (key, overrides = {}) => {
    act(() => {
        window.dispatchEvent(keydown(key, { bubbles: true, cancelable: true, ...overrides }))
    })
}

describe('shouldTogglePanels', () => {
    it('accepts h in either case', () => {
        expect(shouldTogglePanels({ key: 'h' })).toBe(true)
        expect(shouldTogglePanels({ key: 'H' })).toBe(true)
    })

    it('ignores every other key', () => {
        ['f', 'g', 'Enter', ' ', 'Escape'].forEach((key) => {
            expect(shouldTogglePanels({ key })).toBe(false)
        })
    })

    it('leaves the browser its own modifier combinations', () => {
        // Cmd-H hides the window on macOS and Ctrl-H opens history on Windows.
        // The browser wins those races anyway, so claiming them would only
        // break the shortcut without gaining anything.
        expect(shouldTogglePanels({ key: 'h', metaKey: true })).toBe(false)
        expect(shouldTogglePanels({ key: 'h', ctrlKey: true })).toBe(false)
        expect(shouldTogglePanels({ key: 'h', altKey: true })).toBe(false)
    })

    it('does not fire while typing into the panel', () => {
        // Typing "3.5s" into a duration field, or an h into a sequence title,
        // must not close the panel out from under the cursor.
        const input = document.createElement('input')
        const textarea = document.createElement('textarea')
        expect(shouldTogglePanels({ key: 'h', target: input })).toBe(false)
        expect(shouldTogglePanels({ key: 'h', target: textarea })).toBe(false)
    })

    it('survives a missing event', () => {
        expect(shouldTogglePanels()).toBe(false)
        expect(shouldTogglePanels(null)).toBe(false)
    })
})

describe('usePanelToggle', () => {
    it('starts closed, so the piece can be seen while it is being made', () => {
        const { result } = renderHook(() => usePanelToggle({ enabled: true }))
        expect(result.current.open).toBe(false)
    })

    it('opens and closes on H', () => {
        const { result } = renderHook(() => usePanelToggle({ enabled: true }))

        press(PANEL_TOGGLE_KEY)
        expect(result.current.open).toBe(true)

        press(PANEL_TOGGLE_KEY)
        expect(result.current.open).toBe(false)
    })

    it('stays shut for the audience even if the key is pressed', () => {
        // The whole point of the flag. A visitor leaning on the keyboard at an
        // exhibition must not be able to summon the director panel.
        const { result } = renderHook(() => usePanelToggle({ enabled: false }))

        press(PANEL_TOGGLE_KEY)
        expect(result.current.open).toBe(false)
    })

    it('reports closed when the flag goes off while open', () => {
        // A stale `true` surviving the flag being turned off would put the
        // panel in front of an audience.
        const { result, rerender } = renderHook(
            ({ enabled }) => usePanelToggle({ enabled }),
            { initialProps: { enabled: true } }
        )

        press(PANEL_TOGGLE_KEY)
        expect(result.current.open).toBe(true)

        rerender({ enabled: false })
        expect(result.current.open).toBe(false)
    })

    it('ignores a modified H', () => {
        const { result } = renderHook(() => usePanelToggle({ enabled: true }))
        press(PANEL_TOGGLE_KEY, { ctrlKey: true })
        expect(result.current.open).toBe(false)
    })

    it('detaches its listener on unmount', () => {
        const { result, unmount } = renderHook(() => usePanelToggle({ enabled: true }))
        unmount()
        // Would throw on a setState-after-unmount if the listener survived.
        expect(() => press(PANEL_TOGGLE_KEY)).not.toThrow()
        expect(result.current.open).toBe(false)
    })
})
