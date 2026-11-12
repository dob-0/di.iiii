import { afterEach, describe, expect, it, vi } from 'vitest'
import { LASER_POST_TIMEOUT_MS, goLaserLook, setLaserBlackout } from './laserLink.js'

afterEach(() => vi.useRealTimers())

describe('laser sends answer in bounded time (review 2026-11-12, N3876 #4)', () => {
    it('a send the engine never answers resolves false after the timeout and aborts the fetch', async () => {
        vi.useFakeTimers()
        let seenSignal = null
        const fetchImpl = vi.fn((url, init) => {
            seenSignal = init.signal
            return new Promise(() => {}) // never answers, ignores the signal
        })
        const result = setLaserBlackout(true, { fetchImpl })
        await vi.advanceTimersByTimeAsync(LASER_POST_TIMEOUT_MS + 1)
        await expect(result).resolves.toBe(false)
        expect(seenSignal?.aborted).toBe(true)
    })

    it('a fetch that honours the signal is aborted at the timeout and the send is false', async () => {
        vi.useFakeTimers()
        const fetchImpl = vi.fn((url, init) => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }))
        const result = setLaserBlackout(false, { fetchImpl })
        await vi.advanceTimersByTimeAsync(LASER_POST_TIMEOUT_MS + 1)
        await expect(result).resolves.toBe(false)
        expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
    })

    it('an answer before the timeout is used', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true }))
        await expect(goLaserLook('look-1', { fetchImpl })).resolves.toBe(true)
        const [, init] = fetchImpl.mock.calls[0]
        expect(JSON.parse(init.body)).toEqual({ look: 'look-1' })
    })

    it('a failed answer or a thrown fetch is false, never a throw', async () => {
        await expect(setLaserBlackout(false, { fetchImpl: async () => ({ ok: false }) })).resolves.toBe(false)
        await expect(setLaserBlackout(false, { fetchImpl: async () => { throw new Error('down') } })).resolves.toBe(false)
    })

    it('a custom timeout is honoured', async () => {
        vi.useFakeTimers()
        const result = goLaserLook('x', { fetchImpl: () => new Promise(() => {}), timeoutMs: 50 })
        await vi.advanceTimersByTimeAsync(51)
        await expect(result).resolves.toBe(false)
    })
})
