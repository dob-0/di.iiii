import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ioCalls = vi.hoisted(() => [])

vi.mock('socket.io-client', () => ({
    io: (...args) => {
        ioCalls.push(args)
        return {
            on: vi.fn(),
            off: vi.fn(),
            emit: vi.fn(),
            disconnect: vi.fn()
        }
    }
}))

import { useProjectPresence } from './useProjectPresence.js'

// Reconnect drip: socket.io's default backoff tops out at 5s and retries
// forever — against a server that is simply off (a local install after
// `di down`) that is a permanent drip. The cadence must be capped at the
// shared 15s cooldown (apiClient's SERVER_UNAVAILABLE_COOLDOWN_MS).
describe('useProjectPresence reconnect cap', () => {
    afterEach(() => {
        ioCalls.length = 0
    })

    it('caps socket.io reconnection backoff at the shared 15s cooldown', () => {
        const { unmount } = renderHook(() => useProjectPresence({ projectId: 'p1' }))

        expect(ioCalls.length).toBeGreaterThan(0)
        const options = ioCalls[0][1]
        expect(options.reconnection).toBe(true)
        expect(options.reconnectionDelayMax).toBe(15000)

        unmount()
    })
})
