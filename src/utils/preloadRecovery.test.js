import { describe, expect, it, vi } from 'vitest'
import { installPreloadRecovery, PRELOAD_RELOAD_FLAG } from './preloadRecovery.js'

const fakeWin = () => {
    const store = new Map()
    const listeners = {}
    return {
        sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
        location: { reload: vi.fn() },
        addEventListener: (n, f) => { listeners[n] = f },
        removeEventListener: (n) => { delete listeners[n] },
        fire: () => { const e = { preventDefault: vi.fn() }; listeners['vite:preloadError']?.(e); return e },
        store
    }
}

describe('installPreloadRecovery', () => {
    it('reloads once on a failed chunk and prevents the throw', () => {
        const win = fakeWin()
        installPreloadRecovery({ win, now: () => 1000 })
        const e = win.fire()
        expect(win.location.reload).toHaveBeenCalledTimes(1)
        expect(e.preventDefault).toHaveBeenCalled()
        expect(win.store.get(PRELOAD_RELOAD_FLAG)).toBe('1000')
    })
    it('does not loop: a second failure inside the window does not reload', () => {
        const win = fakeWin()
        let t = 1000
        installPreloadRecovery({ win, now: () => t })
        win.fire(); t = 5000; win.fire()
        expect(win.location.reload).toHaveBeenCalledTimes(1)
    })
    it('allows another reload after the window (next deploy)', () => {
        const win = fakeWin()
        let t = 1000
        installPreloadRecovery({ win, now: () => t })
        win.fire(); t = 100_000; win.fire()
        expect(win.location.reload).toHaveBeenCalledTimes(2)
    })
    it('does nothing when storage is unavailable (cannot guard, so cannot loop)', () => {
        const win = fakeWin()
        win.sessionStorage = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
        installPreloadRecovery({ win })
        win.fire()
        expect(win.location.reload).not.toHaveBeenCalled()
    })
})
