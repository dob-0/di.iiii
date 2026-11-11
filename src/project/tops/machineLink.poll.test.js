import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../../services/apiClient.js', () => ({ apiFetch: (...args) => apiFetch(...args) }))

const { createMachineLink } = await import('./machineLink.js')

const signalCalls = () => apiFetch.mock.calls.filter(([url]) => /\/signal\?peer=/.test(url)).length

describe('the machine link long poll', () => {
    let peers
    beforeEach(() => {
        vi.useFakeTimers()
        peers = []
        apiFetch.mockReset()
        apiFetch.mockImplementation(async (url, options) => {
            if (/machines\/hello$/.test(url)) return { machine: { id: 'm-here', name: 'here' }, peers: [{ peerId: options.body.peerId, machineId: 'm-here' }, ...peers] }
            // A long poll: held until aborted or the wait ends.
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => resolve({ messages: [] }), 20000)
                options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) })
            })
        })
    })
    afterEach(() => { vi.useRealTimers() })

    it('holds no connection while this machine is alone, even with a second page of its own', async () => {
        peers = [{ peerId: 'other-tab', machineId: 'm-here' }]
        const link = createMachineLink({ spaceId: 'space' })
        await vi.advanceTimersByTimeAsync(11000)
        expect(signalCalls()).toBe(0)
        link.stop()
    })

    it('starts polling when another machine links, and only one poll at a time', async () => {
        const link = createMachineLink({ spaceId: 'space' })
        await vi.advanceTimersByTimeAsync(6000)
        expect(signalCalls()).toBe(0)
        peers = [{ peerId: 'far', machineId: 'm-there' }]
        await vi.advanceTimersByTimeAsync(11000)
        expect(signalCalls()).toBe(1)
        link.stop()
    })
})
