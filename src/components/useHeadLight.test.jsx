import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHeadLight } from './useHeadLight.js'

const press = (key, init = {}, target = window) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
})

afterEach(() => { document.body.innerHTML = '' })

const mount = (available = true) => renderHook(({ available: a }) => useHeadLight(a), { initialProps: { available } })

describe('useHeadLight: the visitor\'s own switch', () => {
    it('is off at first, F turns it on and off', () => {
        const { result } = mount(true)
        expect(result.current.on).toBe(false)
        press('f')
        expect(result.current.on).toBe(true)
        press('F')
        expect(result.current.on).toBe(false)
    })

    it('the on-screen button does the same through toggle', () => {
        const { result } = mount(true)
        act(() => result.current.toggle())
        expect(result.current.on).toBe(true)
        act(() => result.current.toggle())
        expect(result.current.on).toBe(false)
    })

    it('does nothing when the project did not turn it on: no key, no button', () => {
        const { result } = mount(false)
        press('f')
        act(() => result.current.toggle())
        expect(result.current.on).toBe(false)
    })

    it('ignores F while typing in a field, with a modifier, and on key repeat', () => {
        const { result } = mount(true)
        const input = document.createElement('input')
        document.body.appendChild(input)
        press('f', {}, input)
        press('f', { ctrlKey: true })
        press('f', { metaKey: true })
        press('f', { repeat: true })
        expect(result.current.on).toBe(false)
    })

    it('starts dark again after the visitor leaves walk mode', () => {
        const { result, rerender } = mount(true)
        press('f')
        expect(result.current.on).toBe(true)
        rerender({ available: false })
        expect(result.current.on).toBe(false)
        rerender({ available: true })
        expect(result.current.on).toBe(false)
    })

    it('lets go of the key when it goes away', () => {
        const add = vi.spyOn(window, 'addEventListener')
        const remove = vi.spyOn(window, 'removeEventListener')
        const { unmount } = mount(true)
        const added = add.mock.calls.filter(([type]) => type === 'keydown').length
        unmount()
        const removed = remove.mock.calls.filter(([type]) => type === 'keydown').length
        expect(added).toBeGreaterThan(0)
        expect(removed).toBe(added)
        add.mockRestore()
        remove.mockRestore()
    })
})
