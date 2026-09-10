import { describe, expect, it, vi } from 'vitest'
import { safeHistoryCall } from './safeHistory.js'

describe('safeHistoryCall', () => {
    it('runs the function and reports success', () => {
        const fn = vi.fn()
        expect(safeHistoryCall(fn)).toBe(true)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    // Regression guard: LandingPage's route-section open/close used to call
    // window.history.pushState/replaceState/back directly. Inside the
    // sandboxed snapshot (opaque origin), pushState throws a SecurityError —
    // and because that call sat at the end of the click handler, the error
    // reached the console uncaught on every panel open, even though the panel
    // itself still rendered. This is what stops the throw from escaping.
    it('swallows a SecurityError from an opaque-origin pushState and reports failure', () => {
        const throwing = () => {
            throw new DOMException('cannot be created in a document with origin \'null\'', 'SecurityError')
        }
        expect(() => safeHistoryCall(throwing)).not.toThrow()
        expect(safeHistoryCall(throwing)).toBe(false)
    })
})
