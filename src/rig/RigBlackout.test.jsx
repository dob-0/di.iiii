import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import RigBlackout from './RigBlackout.jsx'

let capturedHandlers = null
const unsubscribeSpy = vi.fn()

vi.mock('./rigEvents.js', () => ({
    subscribe: (baseUrl, handlers) => {
        capturedHandlers = handlers
        return unsubscribeSpy
    }
}))

describe('RigBlackout', () => {
    beforeEach(() => {
        capturedHandlers = null
        unsubscribeSpy.mockClear()
    })

    afterEach(() => {
        cleanup()
    })

    it('renders nothing while blackout is off', () => {
        const { container } = render(<RigBlackout />)
        expect(container.querySelector('.rig-blackout')).toBeNull()
    })

    it('renders a full-window black, pointer-events-none layer once blackout turns on', () => {
        const { container } = render(<RigBlackout />)
        act(() => { capturedHandlers.onBlackout({ on: true, from: null }) })
        const layer = container.querySelector('.rig-blackout')
        expect(layer).toBeTruthy()
        expect(layer.style.pointerEvents).toBe('none')
        expect(layer.style.position).toBe('fixed')
    })

    it('clears the layer when blackout turns back off', () => {
        const { container } = render(<RigBlackout />)
        act(() => { capturedHandlers.onBlackout({ on: true, from: null }) })
        expect(container.querySelector('.rig-blackout')).toBeTruthy()
        act(() => { capturedHandlers.onBlackout({ on: false, from: null }) })
        expect(container.querySelector('.rig-blackout')).toBeNull()
    })

    it('unsubscribes on unmount', () => {
        const { unmount } = render(<RigBlackout />)
        unmount()
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
    })

    it('reload calls window.location.reload', () => {
        const reload = vi.fn()
        const original = window.location
        Object.defineProperty(window, 'location', { value: { ...original, reload, assign: vi.fn() }, writable: true })
        render(<RigBlackout />)
        act(() => { capturedHandlers.onReload({}) })
        expect(reload).toHaveBeenCalledTimes(1)
        Object.defineProperty(window, 'location', { value: original, writable: true })
    })

    it('show-page navigates only for a same-origin path', () => {
        const assign = vi.fn()
        const original = window.location
        Object.defineProperty(window, 'location', { value: { ...original, assign, reload: vi.fn() }, writable: true })
        render(<RigBlackout />)
        act(() => { capturedHandlers.onShowPage({ url: '/atlas' }) })
        expect(assign).toHaveBeenCalledWith('/atlas')

        assign.mockClear()
        act(() => { capturedHandlers.onShowPage({ url: 'https://evil.example/x' }) })
        expect(assign).not.toHaveBeenCalled()

        act(() => { capturedHandlers.onShowPage({ url: '//evil.example/x' }) })
        expect(assign).not.toHaveBeenCalled()

        Object.defineProperty(window, 'location', { value: original, writable: true })
    })
})
