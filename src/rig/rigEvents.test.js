import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribe } from './rigEvents.js'

// Same fake shape as src/services/sceneSyncService.test.js's FakeEventSource.
class FakeEventSource {
    constructor(url) {
        this.url = url
        this.listeners = new Map()
        this.closed = false
        FakeEventSource.instances.push(this)
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
        const handler = this.listeners.get(type)
        if (handler) handler({ data: JSON.stringify(data) })
    }
}
FakeEventSource.instances = []

beforeEach(() => {
    FakeEventSource.instances = []
    globalThis.EventSource = FakeEventSource
})

afterEach(() => {
    delete globalThis.EventSource
})

describe('subscribe', () => {
    it('opens baseUrl + /api/rig/events', () => {
        subscribe('http://localhost:4000/serverXR', {})
        expect(FakeEventSource.instances[0].url).toBe('http://localhost:4000/serverXR/api/rig/events')
    })

    it('strips a trailing slash off baseUrl before joining', () => {
        subscribe('http://localhost:4000/serverXR/', {})
        expect(FakeEventSource.instances[0].url).toBe('http://localhost:4000/serverXR/api/rig/events')
    })

    it('forwards blackout, reload and show-page to their handlers, parsed', () => {
        const onBlackout = vi.fn()
        const onReload = vi.fn()
        const onShowPage = vi.fn()
        subscribe('http://localhost:4000', { onBlackout, onReload, onShowPage })
        const source = FakeEventSource.instances[0]

        source.emit('blackout', { on: true, from: { id: 'm1', name: 'aylmo' } })
        expect(onBlackout).toHaveBeenCalledWith({ on: true, from: { id: 'm1', name: 'aylmo' } })

        source.emit('reload', {})
        expect(onReload).toHaveBeenCalledWith({})

        source.emit('show-page', { url: '/atlas' })
        expect(onShowPage).toHaveBeenCalledWith({ url: '/atlas' })
    })

    it('unsubscribe removes listeners and closes the source', () => {
        const onBlackout = vi.fn()
        const unsubscribe = subscribe('http://localhost:4000', { onBlackout })
        const source = FakeEventSource.instances[0]
        unsubscribe()
        expect(source.closed).toBe(true)
        source.emit('blackout', { on: true, from: null })
        expect(onBlackout).not.toHaveBeenCalled()
    })

    it('does nothing and does not throw when EventSource is unavailable', () => {
        delete globalThis.EventSource
        expect(() => subscribe('http://localhost:4000', {})).not.toThrow()
        const unsubscribe = subscribe('http://localhost:4000', {})
        expect(() => unsubscribe()).not.toThrow()
    })

    it('logs the connection failure once, quietly, no matter how many times it errors', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
        subscribe('http://localhost:4000', {})
        const source = FakeEventSource.instances[0]
        source.onerror()
        source.onerror()
        source.onerror()
        expect(debugSpy).toHaveBeenCalledTimes(1)
        debugSpy.mockRestore()
    })

    it('a malformed event payload is swallowed, handler gets {}', () => {
        const onBlackout = vi.fn()
        subscribe('http://localhost:4000', { onBlackout })
        const source = FakeEventSource.instances[0]
        const handler = source.listeners.get('blackout')
        handler({ data: 'not json' })
        expect(onBlackout).toHaveBeenCalledWith({})
    })
})
