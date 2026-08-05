import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectSyncService } from './projectSyncService.js'

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
})
