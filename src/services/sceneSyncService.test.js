import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createSceneSyncService,
    RECONNECT_COOLDOWN_MS,
    RECONNECT_ERRORS_BEFORE_COOLDOWN
} from './sceneSyncService.js'

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
}

// Reconnect drip: EventSource auto-retries every ~3s forever, so a stopped
// local server (di down, closed laptop) got a permanent request drip from
// every open tab. Same cap and cooldown as projectSyncService.
describe('createSceneSyncService reconnect cap', () => {
    beforeEach(() => {
        globalThis.EventSource = FakeEventSource
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        delete globalThis.EventSource
    })

    it('closes the stream after repeated errors and reconnects only after the cooldown', () => {
        const service = createSceneSyncService()
        service.connect({ eventsUrl: '/api/spaces/main/events' })
        const first = service.currentSource

        for (let i = 0; i < RECONNECT_ERRORS_BEFORE_COOLDOWN; i += 1) {
            first.onerror()
        }

        expect(first.closed).toBe(true)
        expect(service.currentSource).toBe(null)

        vi.advanceTimersByTime(RECONNECT_COOLDOWN_MS)
        expect(service.currentSource).not.toBe(null)
        expect(service.currentSource).not.toBe(first)

        service.disconnect()
    })

    it('a successful open resets the error count', () => {
        const service = createSceneSyncService()
        service.connect({ eventsUrl: '/api/spaces/main/events' })
        const source = service.currentSource

        source.onerror()
        source.onerror()
        source.onopen()
        source.onerror()
        source.onerror()

        expect(service.currentSource).toBe(source)
        expect(source.closed).not.toBe(true)

        service.disconnect()
    })
})
