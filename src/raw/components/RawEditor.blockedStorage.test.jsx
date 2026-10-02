import { afterEach, describe, expect, it, vi } from 'vitest'

describe('RawEditor import with blocked storage', () => {
    const realDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    afterEach(() => {
        Object.defineProperty(window, 'localStorage', realDescriptor)
        vi.resetModules()
    })

    it('does not throw at import when window.localStorage access throws', async () => {
        vi.resetModules()
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new DOMException('blocked', 'SecurityError') }
        })
        await expect(import('./RawEditor.jsx')).resolves.toBeTruthy()
    }, 60000)

    it('does not throw at import when getItem throws', async () => {
        vi.resetModules()
        const boom = () => { throw new DOMException('blocked', 'SecurityError') }
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: { getItem: boom, setItem: boom, removeItem: boom }
        })
        await expect(import('./RawEditor.jsx')).resolves.toBeTruthy()
    }, 60000)
})
