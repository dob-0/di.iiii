import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveAiSocketUrl, sendSize, startLiveAiRestyle } from './liveAiRestyle.js'

// A WebSocket the test drives by hand.
class FakeSocket {
    static last = null
    constructor(url) {
        this.url = url
        this.readyState = 0
        this.sent = []
        FakeSocket.last = this
    }
    send(data) { this.sent.push(data) }
    close() { this.readyState = 3 }
    open() { this.readyState = 1; this.onopen?.() }
    receive(data) { this.onmessage?.({ data }) }
    drop() { this.readyState = 3; this.onclose?.() }
}

const fakeCanvas = () => {
    const context = { drawImage: vi.fn() }
    return {
        width: 640,
        height: 360,
        context,
        getContext: () => context,
        toBlob: (done) => done(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    }
}

const frames = (socket) => socket.sent.filter((item) => typeof item !== 'string')
const texts = (socket) => socket.sent.filter((item) => typeof item === 'string').map((item) => JSON.parse(item))
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('startLiveAiRestyle', () => {
    let canvas
    let video
    let statuses
    let drawn

    beforeEach(() => {
        canvas = fakeCanvas()
        video = { readyState: 4, videoWidth: 1280, videoHeight: 720 }
        statuses = []
        drawn = 0
    })
    afterEach(() => { FakeSocket.last = null })

    const start = (params = { prompt: 'gold leaf', strength: 0.6 }) => startLiveAiRestyle({
        canvas,
        video,
        params,
        url: 'ws://test/liveai',
        WebSocketImpl: FakeSocket,
        createCanvas: fakeCanvas,
        createBitmap: async () => ({ close: () => {} }),
        onStatus: (status) => statuses.push(status),
        onFrame: () => { drawn += 1 }
    })

    it('sends its params on connect, then exactly one frame', async () => {
        const restyle = start()
        const socket = FakeSocket.last
        socket.open()
        await settle()
        expect(texts(socket)[0]).toEqual({ type: 'params', prompt: 'gold leaf', strength: 0.6 })
        expect(frames(socket)).toHaveLength(1)
        restyle.stop()
    })

    it('keeps ONE frame in flight: the next goes only when the answer arrives', async () => {
        const restyle = start()
        const socket = FakeSocket.last
        socket.open()
        await settle()
        await settle()
        expect(frames(socket)).toHaveLength(1)
        socket.receive(new Blob([new Uint8Array([9])]))
        await settle()
        expect(frames(socket)).toHaveLength(2)
        expect(drawn).toBe(1)
        expect(statuses.at(-1).state).toBe('live')
        restyle.stop()
    })

    it('sends changed params without reconnecting', async () => {
        const restyle = start()
        const socket = FakeSocket.last
        socket.open()
        restyle.setParams({ prompt: 'deep blue' })
        expect(texts(socket).at(-1)).toEqual({ type: 'params', prompt: 'deep blue', strength: 0.6 })
        expect(FakeSocket.last).toBe(socket)
        restyle.stop()
    })

    it("passes the relay's no-engine sentence to the surface and keeps it through the close", async () => {
        vi.useFakeTimers()
        const restyle = start()
        const socket = FakeSocket.last
        socket.open()
        socket.receive(JSON.stringify({ type: 'status', state: 'no-engine', detail: 'no live-AI engine at ws://127.0.0.1:7861/ws' }))
        socket.drop()
        expect(statuses.at(-1)).toEqual({ state: 'no-engine', detail: 'no live-AI engine at ws://127.0.0.1:7861/ws' })
        // …and tries again later, so starting the engine needs no reload.
        vi.advanceTimersByTime(3000)
        expect(FakeSocket.last).not.toBe(socket)
        restyle.stop()
        vi.useRealTimers()
    })

    it('stops cleanly: no reconnect after stop()', () => {
        vi.useFakeTimers()
        const restyle = start()
        const socket = FakeSocket.last
        restyle.stop()
        socket.drop()
        vi.advanceTimersByTime(10000)
        expect(FakeSocket.last).toBe(socket)
        vi.useRealTimers()
    })
})

describe('liveAi helpers', () => {
    it('sends ~512 wide in the camera\'s own shape, multiples of 8', () => {
        expect(sendSize(1280, 720)).toEqual({ width: 512, height: 288 })
        expect(sendSize(1920, 1080)).toEqual({ width: 512, height: 288 })
        expect(sendSize(640, 480)).toEqual({ width: 512, height: 384 })
    })

    it('speaks wss on an https page (a headset) and ws on http', () => {
        expect(liveAiSocketUrl({ protocol: 'https:', host: '192.168.1.5:5173' })).toMatch(/^wss:\/\/192\.168\.1\.5:5173\/.*liveai$/)
        expect(liveAiSocketUrl({ protocol: 'http:', host: 'localhost:5173' })).toMatch(/^ws:\/\/localhost:5173\/.*liveai$/)
    })
})
