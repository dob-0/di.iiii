import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRawPointerLockForTests, requestRawPointerLock } from './rawPointerLock.js'

const err = (name) => Object.assign(new Error(name), { name })

beforeEach(() => {
    __resetRawPointerLockForTests()
    vi.stubGlobal('navigator', { ...globalThis.navigator, userAgentData: { brands: [] } })
})
afterEach(() => vi.unstubAllGlobals())

describe('requestRawPointerLock', () => {
    it('uses raw input when granted', async () => {
        const el = { requestPointerLock: vi.fn(() => Promise.resolve()) }
        expect(await requestRawPointerLock(el)).toMatchObject({ locked: true, raw: true })
        expect(el.requestPointerLock).toHaveBeenCalledWith({ unadjustedMovement: true })
    })
    it('falls back to a plain lock on NotSupportedError (Chromium 153, Linux X11) and remembers it', async () => {
        const el = {
            requestPointerLock: vi.fn((opts) => (opts ? Promise.reject(err('NotSupportedError')) : Promise.resolve()))
        }
        expect(await requestRawPointerLock(el)).toMatchObject({ locked: true, raw: false, reason: 'raw not supported' })
        expect(el.requestPointerLock).toHaveBeenCalledTimes(2)
        await requestRawPointerLock(el)
        expect(el.requestPointerLock).toHaveBeenCalledTimes(3) // no second raw attempt
        expect(el.requestPointerLock.mock.calls[2]).toEqual([])
    })
    it('remembers NotSupported for this browser build across visits', async () => {
        const el = {
            requestPointerLock: vi.fn((opts) => (opts ? Promise.reject(err('NotSupportedError')) : Promise.resolve()))
        }
        await requestRawPointerLock(el)
        // A fresh page: module state gone, storage kept.
        const { __resetRawPointerLockForTests: _unused, ...mod } = await import('./rawPointerLock.js?fresh=1')
        el.requestPointerLock.mockClear()
        expect(await mod.requestRawPointerLock(el)).toMatchObject({ raw: false, reason: 'raw not supported' })
        expect(el.requestPointerLock).toHaveBeenCalledTimes(1)
        expect(el.requestPointerLock).toHaveBeenCalledWith()
    })
    it('does not retry a lock denied for any other reason (drag-look takes over)', async () => {
        const el = { requestPointerLock: vi.fn(() => Promise.reject(err('SecurityError'))) }
        expect(await requestRawPointerLock(el)).toMatchObject({ locked: false, raw: false, reason: 'SecurityError' })
        expect(el.requestPointerLock).toHaveBeenCalledTimes(1)
    })
    it('never trusts the raw option outside Chromium', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Firefox' })
        const el = { requestPointerLock: vi.fn(() => Promise.resolve()) }
        expect(await requestRawPointerLock(el)).toMatchObject({ locked: true, raw: false })
        expect(el.requestPointerLock).toHaveBeenCalledWith()
    })
    it('pre-2.0 Chromium (no promise) counts as not raw', async () => {
        const el = { requestPointerLock: vi.fn(() => undefined) }
        expect(await requestRawPointerLock(el)).toMatchObject({ raw: false })
    })
})
