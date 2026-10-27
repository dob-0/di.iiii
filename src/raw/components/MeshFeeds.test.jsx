import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MeshInFeed, MeshOutFeed, resolveMeshGroup } from './MeshFeeds.jsx'

// No hub in a jsdom test: the socket is faked at the WebSocket boundary and
// what goes over it is recorded. The real hub is exercised by meshClient.test.js.
const server = { serverUrl: 'http://hub.test', path: '/serverXR/socket.io' }
let sockets = []
class FakeSocket {
    constructor(url) {
        this.url = url
        this.sent = []
        sockets.push(this)
    }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() {}
}
const open = (socket) => act(() => { socket.onopen() })
const deliver = (socket, message) => act(() => { socket.onmessage({ data: JSON.stringify(message) }) })
const lastReport = (spy, nodeId, port) => {
    const calls = spy.mock.calls.filter(([id, p]) => id === nodeId && p === port)
    return calls.length ? calls.at(-1)[2] : undefined
}

beforeEach(() => {
    sockets = []
    vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('resolveMeshGroup', () => {
    it('uses the typed group, else the project’s own', () => {
        expect(resolveMeshGroup('wall', 'space/p1')).toBe('wall')
        expect(resolveMeshGroup('  ', 'space/p1')).toBe('space/p1')
        expect(resolveMeshGroup('', '')).toBe('default')
    })
})

describe('MeshOutFeed', () => {
    const node = { id: 'mo-1', typeId: 'device.mesh.out', values: {} }
    const feed = (inputs, onLiveOutput) => (
        <MeshOutFeed node={node} inputs={inputs} fallbackGroup="s/p" onLiveOutput={onLiveOutput} server={server} WebSocketImpl={FakeSocket} />
    )

    it('sends nothing while the link is down, then the current value once it is up', () => {
        const onLive = vi.fn()
        const view = render(feed({ channel: 'level', value: 0.1, interval: 200 }, onLive))
        expect(new URL(sockets[0].url).searchParams.get('room')).toBe('s/p')
        view.rerender(feed({ channel: 'level', value: 0.2, interval: 200 }, onLive))
        expect(sockets[0].sent).toEqual([])
        expect(lastReport(onLive, 'mo-1', 'up')).toBe(0)

        open(sockets[0])
        expect(sockets[0].sent).toEqual([{ type: 'publish', channel: 'level', payload: 0.2 }])
        expect(lastReport(onLive, 'mo-1', 'up')).toBe(1)
        expect(lastReport(onLive, 'mo-1', 'status')).toMatch(/^Up in s\/p/)
    })

    it('caps the rate at one send per interval, and the latest value wins', () => {
        const onLive = vi.fn()
        const view = render(feed({ channel: 'level', value: 1, interval: 200 }, onLive))
        open(sockets[0])
        for (const value of [2, 3, 4]) {
            act(() => { vi.advanceTimersByTime(20) })
            view.rerender(feed({ channel: 'level', value, interval: 200 }, onLive))
        }
        expect(sockets[0].sent.map((m) => m.payload)).toEqual([1])
        act(() => { vi.advanceTimersByTime(140) })
        expect(sockets[0].sent.map((m) => m.payload)).toEqual([1, 4])
    })

    it('does not resend a value that only arrived again in a new array', () => {
        const view = render(feed({ value: [1, 2, 3], interval: 50 }, vi.fn()))
        open(sockets[0])
        act(() => { vi.advanceTimersByTime(100) })
        view.rerender(feed({ value: [1, 2, 3], interval: 50 }, vi.fn()))
        act(() => { vi.advanceTimersByTime(100) })
        expect(sockets[0].sent).toHaveLength(1)
    })

    it('clears its report when it goes away', () => {
        const onLive = vi.fn()
        const view = render(feed({ value: 1 }, onLive))
        view.unmount()
        expect(lastReport(onLive, 'mo-1', 'up')).toBeNull()
        expect(lastReport(onLive, 'mo-1', 'status')).toBeNull()
    })
})

describe('MeshInFeed', () => {
    const node = { id: 'mi-1', typeId: 'device.mesh.in', values: {} }
    const feed = (inputs, onLiveOutput) => (
        <MeshInFeed node={node} inputs={inputs} fallbackGroup="s/p" onLiveOutput={onLiveOutput} server={server} WebSocketImpl={FakeSocket} />
    )
    const event = (payload, extra = {}) => ({ type: 'mesh:event', channel: 'level', from: 'web-phone', payload, meta: {}, ts: 1234, ...extra })

    it('gives value, sender and time, and counts each event on Signal', () => {
        const onLive = vi.fn()
        render(feed({ channel: 'level' }, onLive))
        open(sockets[0])
        deliver(sockets[0], event(0.4))
        deliver(sockets[0], event(0.6, { ts: 1300 }))
        expect(lastReport(onLive, 'mi-1', 'value')).toBe(0.6)
        expect(lastReport(onLive, 'mi-1', 'from')).toBe('web-phone')
        expect(lastReport(onLive, 'mi-1', 'time')).toBe(1300)
        expect(lastReport(onLive, 'mi-1', 'signal')).toBe(2)
        expect(lastReport(onLive, 'mi-1', 'up')).toBe(1)
    })

    it('ignores other channels and refuses what fails a check, saying why', () => {
        const onLive = vi.fn()
        render(feed({ channel: 'level', min: 0, max: 1 }, onLive))
        open(sockets[0])
        deliver(sockets[0], event(0.5, { channel: 'other' }))
        deliver(sockets[0], event(7))
        expect(lastReport(onLive, 'mi-1', 'signal')).toBeUndefined()
        expect(lastReport(onLive, 'mi-1', 'status')).toMatch(/1 refused, last: outside 0 to 1/)
        deliver(sockets[0], event(0.5))
        expect(lastReport(onLive, 'mi-1', 'signal')).toBe(1)
    })

    it('says the link is down and when it tries again', () => {
        const onLive = vi.fn()
        render(feed({}, onLive))
        act(() => { sockets[0].onclose({ code: 1006 }) })
        expect(lastReport(onLive, 'mi-1', 'up')).toBe(0)
        expect(lastReport(onLive, 'mi-1', 'status')).toBe('Down, trying again in 1 s')
        act(() => { vi.advanceTimersByTime(1000) })
        expect(sockets).toHaveLength(2)
    })
})
