import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import useScreenWakeLock from './useScreenWakeLock.js'

function Locked() {
    useScreenWakeLock()
    return null
}

// A fake lock that remembers whether it was released, the way the real
// Screen Wake Lock API's sentinel does.
function makeLock() {
    return { released: false, release: vi.fn(function release() { this.released = true; return Promise.resolve() }) }
}

describe('useScreenWakeLock', () => {
    let originalWakeLock

    beforeEach(() => {
        originalWakeLock = navigator.wakeLock
        cleanup()
    })

    afterEach(() => {
        navigator.wakeLock = originalWakeLock
    })

    it('requests a screen lock on mount', async () => {
        const request = vi.fn().mockResolvedValue(makeLock())
        navigator.wakeLock = { request }
        await act(async () => { render(<Locked />) })
        expect(request).toHaveBeenCalledWith('screen')
        expect(request).toHaveBeenCalledTimes(1)
    })

    it('re-requests when the tab becomes visible again', async () => {
        const request = vi.fn().mockResolvedValue(makeLock())
        navigator.wakeLock = { request }
        await act(async () => { render(<Locked />) })
        expect(request).toHaveBeenCalledTimes(1)

        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
        // Hiding never re-asks — the browser has already released the lock,
        // asking again while still hidden would just be refused.
        expect(request).toHaveBeenCalledTimes(1)

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
        expect(request).toHaveBeenCalledTimes(2)
    })

    it('releases the lock on unmount', async () => {
        const lock = makeLock()
        navigator.wakeLock = { request: vi.fn().mockResolvedValue(lock) }
        let unmount
        await act(async () => { ({ unmount } = render(<Locked />)) })
        unmount()
        await act(async () => {})
        expect(lock.released).toBe(true)
    })

    it('stays silent when the lock arrives after unmount', async () => {
        let resolveRequest
        const request = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve }))
        navigator.wakeLock = { request }
        const { unmount } = render(<Locked />)
        unmount()
        const lock = makeLock()
        await act(async () => { resolveRequest(lock) })
        expect(lock.released).toBe(true)
    })

    it('does nothing when the API is absent', async () => {
        navigator.wakeLock = undefined
        expect(() => render(<Locked />)).not.toThrow()
    })

    it('stays silent when the browser refuses the lock', async () => {
        const request = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
        navigator.wakeLock = { request }
        await expect(act(async () => { render(<Locked />) })).resolves.not.toThrow()
    })
})
