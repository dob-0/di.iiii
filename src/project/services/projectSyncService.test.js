import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createProjectSyncService,
    CLOSED_BACKOFF_BASE_MS,
    RECONNECT_COOLDOWN_MS,
    SILENCE_MS,
    RECONNECT_ERRORS_BEFORE_COOLDOWN
} from './projectSyncService.js'

class FakeEventSource {
    constructor(url) {
        this.url = url
        this.listeners = new Map()
    }

    addEventListener(type, handler) {
        this.listeners.set(type, handler)
    }

    removeEventListener(type) {
        this.listeners.delete(type)
    }

    close() {
        this.closed = true
    }

    emit(type, data) {
        this.listeners.get(type)?.({ data: JSON.stringify(data) })
    }
}

describe('createProjectSyncService', () => {
    beforeEach(() => {
        globalThis.EventSource = FakeEventSource
    })

    afterEach(() => {
        delete globalThis.EventSource
    })

    // Regression test for audit batch 3: a rejected onReady (the post-connect
    // catch-up) was dropped by an empty .catch(), so a stream already marked
    // 'connected' silently stayed behind the server with nothing reported.
    it('reports a failed post-connect catch-up instead of swallowing it', async () => {
        const service = createProjectSyncService()
        const onReadyError = vi.fn()
        service.connect({
            eventsUrl: '/api/projects/p1/events',
            onReady: async () => {
                throw new Error('Catch-up unreachable')
            },
            onReadyError
        })

        service.currentSource.emit('ready', { ok: true })
        await vi.waitFor(() => {
            expect(onReadyError).toHaveBeenCalledTimes(1)
        })
        expect(onReadyError.mock.calls[0][0].message).toBe('Catch-up unreachable')

        service.disconnect()
    })

    // Reconnect drip: EventSource auto-retries every ~3s forever, so a
    // stopped local server (di down) got a permanent request drip from every
    // open tab. After a few straight failures the stream must close and wait
    // out the shared 15s cooldown before trying again.
    it('closes the stream after repeated errors and reconnects only after the cooldown', () => {
        vi.useFakeTimers()
        try {
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events' })
            const first = service.currentSource

            for (let i = 0; i < RECONNECT_ERRORS_BEFORE_COOLDOWN; i += 1) {
                first.onerror()
            }

            // stream is closed, nothing new opened yet
            expect(first.closed).toBe(true)
            expect(service.currentSource).toBe(null)

            vi.advanceTimersByTime(RECONNECT_COOLDOWN_MS - 1)
            expect(service.currentSource).toBe(null)

            vi.advanceTimersByTime(1)
            expect(service.currentSource).not.toBe(null)
            expect(service.currentSource).not.toBe(first)

            service.disconnect()
        } finally {
            vi.useRealTimers()
        }
    })

    it('a successful open resets the error count', () => {
        vi.useFakeTimers()
        try {
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events' })
            const source = service.currentSource

            source.onerror()
            source.onerror()
            source.onopen()
            source.onerror()
            source.onerror()

            // never reached the threshold in a row — still the same stream
            expect(service.currentSource).toBe(source)
            expect(source.closed).not.toBe(true)

            service.disconnect()
        } finally {
            vi.useRealTimers()
        }
    })

    it('an explicit disconnect cancels a pending cooldown reconnect', () => {
        vi.useFakeTimers()
        try {
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events' })
            for (let i = 0; i < RECONNECT_ERRORS_BEFORE_COOLDOWN; i += 1) {
                service.currentSource.onerror()
            }
            service.disconnect()

            vi.advanceTimersByTime(RECONNECT_COOLDOWN_MS * 2)
            expect(service.currentSource).toBe(null)
        } finally {
            vi.useRealTimers()
        }
    })

    // After a server restart the proxy answers a new stream with 502; the
    // browser then fails it for good (readyState CLOSED, no retry).
    it('opens a new stream after a backoff when the browser gave up (CLOSED)', () => {
        vi.useFakeTimers()
        try {
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events' })
            const first = service.currentSource
            first.readyState = 2
            first.onerror()

            expect(first.closed).toBe(true)
            expect(service.currentSource).toBe(null)
            vi.advanceTimersByTime(CLOSED_BACKOFF_BASE_MS - 1)
            expect(service.currentSource).toBe(null)
            vi.advanceTimersByTime(1)
            const second = service.currentSource
            expect(second).not.toBe(null)
            expect(second).not.toBe(first)

            // still failing: the wait doubles, capped at the cooldown
            second.readyState = 2
            second.onerror()
            vi.advanceTimersByTime(CLOSED_BACKOFF_BASE_MS * 2 - 1)
            expect(service.currentSource).toBe(null)
            vi.advanceTimersByTime(1)
            expect(service.currentSource).not.toBe(null)

            service.disconnect()
        } finally {
            vi.useRealTimers()
        }
    })

    it('asks onSilent once after SILENCE_MS without an event, then once per SILENCE_MS', () => {
        vi.useFakeTimers()
        try {
            const onSilent = vi.fn()
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events', onSilent })
            const source = service.currentSource

            vi.advanceTimersByTime(SILENCE_MS - 1)
            expect(onSilent).not.toHaveBeenCalled()
            vi.advanceTimersByTime(1)
            expect(onSilent).toHaveBeenCalledTimes(1)
            expect(onSilent).toHaveBeenCalledWith(source)
            vi.advanceTimersByTime(SILENCE_MS)
            expect(onSilent).toHaveBeenCalledTimes(2)

            service.disconnect()
        } finally {
            vi.useRealTimers()
        }
    })

    it('a message resets the silence watchdog', () => {
        vi.useFakeTimers()
        try {
            const onSilent = vi.fn()
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events', onSilent, onProjectOp: () => {} })

            vi.advanceTimersByTime(SILENCE_MS - 1)
            service.currentSource.emit('project-op', { version: 1, ops: [] })
            vi.advanceTimersByTime(SILENCE_MS - 1)
            expect(onSilent).not.toHaveBeenCalled()
            service.currentSource.emit('ready', {})
            vi.advanceTimersByTime(SILENCE_MS - 1)
            expect(onSilent).not.toHaveBeenCalled()
            vi.advanceTimersByTime(1)
            expect(onSilent).toHaveBeenCalledTimes(1)

            service.disconnect()
        } finally {
            vi.useRealTimers()
        }
    })

    it('disconnect clears the silence and backoff timers', () => {
        vi.useFakeTimers()
        try {
            const onSilent = vi.fn()
            const service = createProjectSyncService()
            service.connect({ eventsUrl: '/api/projects/p1/events', onSilent })
            service.disconnect()
            vi.advanceTimersByTime(SILENCE_MS * 3)
            expect(onSilent).not.toHaveBeenCalled()

            service.connect({ eventsUrl: '/api/projects/p1/events', onSilent })
            service.currentSource.readyState = 2
            service.currentSource.onerror()
            service.disconnect()
            vi.advanceTimersByTime(RECONNECT_COOLDOWN_MS * 2)
            expect(service.currentSource).toBe(null)
            expect(vi.getTimerCount()).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('reconnect replaces the stream with the same arguments', () => {
        const service = createProjectSyncService()
        service.connect({ eventsUrl: '/api/projects/p1/events' })
        const first = service.currentSource
        service.reconnect()
        expect(first.closed).toBe(true)
        expect(service.currentSource).not.toBe(first)
        expect(service.currentSource.url).toBe('/api/projects/p1/events')
        service.disconnect()
    })
})
