// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
    MESH_BACKOFF_FIRST_MS,
    MESH_BACKOFF_MAX_MS,
    MESH_CLOSE_ID_IN_USE,
    MESH_STATE,
    checkMeshPayload,
    createMeshClient,
    createMeshNodeId,
    createSendGate,
    meshSocketUrl,
    nextMeshBackoff,
} from './meshClient.js'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const { initializeMesh } = require('../../../serverXR/src/meshHub.js')

const until = (predicate, ms = 3000) => new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
        if (predicate()) return resolve()
        if (Date.now() - started > ms) return reject(new Error('timed out'))
        setTimeout(tick, 10)
    }
    tick()
})

describe('meshSocketUrl', () => {
    it('sits beside socket.io on the same base path, ws for http and wss for https', () => {
        expect(meshSocketUrl({ serverUrl: 'https://example.test', path: '/serverXR/socket.io', group: 'a b', nodeId: 'web-1' }))
            .toBe('wss://example.test/serverXR/mesh?room=a+b&node=web-1')
        expect(meshSocketUrl({ serverUrl: 'http://localhost:5173', path: '/socket.io', group: '', nodeId: 'web-2' }))
            .toBe('ws://localhost:5173/mesh?room=default&node=web-2')
    })

    it('cuts the group and node id at the hub’s 64 characters, and answers nothing without a server', () => {
        const url = new URL(meshSocketUrl({ serverUrl: 'http://h', path: '/serverXR/socket.io', group: 'g'.repeat(80), nodeId: 'n'.repeat(80) }))
        expect(url.searchParams.get('room')).toHaveLength(64)
        expect(url.searchParams.get('node')).toHaveLength(64)
        expect(meshSocketUrl({ serverUrl: '', group: 'x', nodeId: 'y' })).toBe('')
    })
})

describe('node id and backoff', () => {
    it('never claims the hub’s reserved keeper ids', () => {
        for (const r of [0, 0.5, 0.999999]) expect(createMeshNodeId(() => r)).toMatch(/^web-[0-9a-z]{7}$/)
    })

    it('waits 1 s, doubles, and stops at 10 s', () => {
        const steps = []
        let ms = 0
        for (let i = 0; i < 6; i += 1) steps.push(ms = nextMeshBackoff(ms))
        expect(steps).toEqual([1000, 2000, 4000, 8000, 10000, 10000])
    })
})

describe('checkMeshPayload', () => {
    it('passes everything with no check set, including the 0/0 range a fresh node carries', () => {
        expect(checkMeshPayload('anything', {}).ok).toBe(true)
        expect(checkMeshPayload({ x: 1 }, { min: 0, max: 0, allowed: '', maxLength: 0 }).ok).toBe(true)
    })

    it('holds a range, an allowed list and a length cap', () => {
        expect(checkMeshPayload(0.5, { min: 0, max: 1 }).ok).toBe(true)
        expect(checkMeshPayload(1.5, { min: 0, max: 1 })).toEqual({ ok: false, reason: 'outside 0 to 1' })
        expect(checkMeshPayload('0.5', { min: 0, max: 1 })).toEqual({ ok: false, reason: 'not a number' })
        expect(checkMeshPayload('red', { allowed: 'red, green' }).ok).toBe(true)
        expect(checkMeshPayload('blue', { allowed: 'red, green' }).ok).toBe(false)
        expect(checkMeshPayload('hello', { maxLength: 5 }).ok).toBe(true)
        expect(checkMeshPayload('hello!', { maxLength: 5 }).ok).toBe(false)
    })
})

describe('createSendGate', () => {
    it('lets one send through per interval and says how long to wait', () => {
        const gate = createSendGate(200)
        expect(gate.waitFor(1000)).toBe(0)
        gate.sent(1000)
        expect(gate.waitFor(1050)).toBe(150)
        expect(gate.waitFor(1200)).toBe(0)
    })
})

describe('createMeshClient reconnect, with a stand-in socket', () => {
    const makeFakeSocket = () => {
        const sockets = []
        class FakeSocket {
            constructor(url) {
                this.url = url
                this.sent = []
                sockets.push(this)
            }
            send(data) { this.sent.push(JSON.parse(data)) }
            close() {}
        }
        return { FakeSocket, sockets }
    }

    it('reports down, retries at 1 s then 2 s, and starts again from 1 s once up', () => {
        vi.useFakeTimers()
        try {
            const { FakeSocket, sockets } = makeFakeSocket()
            const states = []
            const client = createMeshClient({ serverUrl: 'http://h', path: '/serverXR/socket.io', group: 'g', nodeId: 'web-a', WebSocketImpl: FakeSocket, onState: (s) => states.push(s) })
            expect(sockets).toHaveLength(1)
            expect(client.publish('c', 1)).toBe(false)

            sockets[0].onclose({ code: 1006 })
            expect(client.state).toBe(MESH_STATE.DOWN)
            expect(states.at(-1).retryInMs).toBe(MESH_BACKOFF_FIRST_MS)
            vi.advanceTimersByTime(999)
            expect(sockets).toHaveLength(1)
            vi.advanceTimersByTime(1)
            expect(sockets).toHaveLength(2)

            sockets[1].onclose({ code: 1006 })
            expect(states.at(-1).retryInMs).toBe(2000)
            vi.advanceTimersByTime(2000)
            sockets[2].onopen()
            expect(client.state).toBe(MESH_STATE.UP)
            expect(client.publish('c', 1)).toBe(true)
            expect(sockets[2].sent).toEqual([{ type: 'publish', channel: 'c', payload: 1 }])

            sockets[2].onclose({ code: 1006 })
            expect(states.at(-1).retryInMs).toBe(MESH_BACKOFF_FIRST_MS)

            for (let i = 0; i < 8; i += 1) {
                vi.advanceTimersByTime(MESH_BACKOFF_MAX_MS)
                sockets.at(-1).onclose({ code: 1006 })
            }
            expect(states.at(-1).retryInMs).toBe(MESH_BACKOFF_MAX_MS)

            client.close()
            const count = sockets.length
            vi.advanceTimersByTime(MESH_BACKOFF_MAX_MS * 2)
            expect(sockets).toHaveLength(count)
            expect(client.state).toBe(MESH_STATE.CLOSED)
        } finally {
            vi.useRealTimers()
        }
    })

    it('takes a fresh node id when the hub says the old one is still held', () => {
        vi.useFakeTimers()
        try {
            const { FakeSocket, sockets } = makeFakeSocket()
            const client = createMeshClient({ serverUrl: 'http://h', group: 'g', nodeId: 'web-a', WebSocketImpl: FakeSocket })
            sockets[0].onclose({ code: MESH_CLOSE_ID_IN_USE, reason: 'Node id in use' })
            vi.advanceTimersByTime(MESH_BACKOFF_FIRST_MS)
            expect(client.nodeId).not.toBe('web-a')
            expect(new URL(sockets[1].url).searchParams.get('node')).toBe(client.nodeId)
            client.close()
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('createMeshClient against the real hub (serverXR/src/meshHub.js)', () => {
    let httpServer
    let serverUrl
    const path = '/serverXR/socket.io'

    beforeAll(async () => {
        httpServer = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
        initializeMesh(httpServer, { basePath: '/serverXR' })
        await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
        serverUrl = `http://127.0.0.1:${httpServer.address().port}`
    })

    afterAll(async () => {
        httpServer.closeAllConnections?.()
        await new Promise((resolve) => httpServer.close(resolve))
    })

    it('comes up, sees the other member, and carries a publish to it with sender and time', async () => {
        const heard = []
        const wall = createMeshClient({ serverUrl, path, group: 'g1', nodeId: 'web-wall', WebSocketImpl: WebSocket, onEvent: (m) => heard.push(m) })
        await until(() => wall.state === MESH_STATE.UP)
        const phone = createMeshClient({ serverUrl, path, group: 'g1', nodeId: 'web-phone', WebSocketImpl: WebSocket })
        await until(() => phone.state === MESH_STATE.UP && wall.members.includes('web-phone'))

        const before = Date.now()
        expect(phone.publish('level', 0.75)).toBe(true)
        await until(() => heard.length === 1)
        expect(heard[0]).toMatchObject({ type: 'mesh:event', channel: 'level', from: 'web-phone', payload: 0.75 })
        expect(heard[0].ts).toBeGreaterThanOrEqual(before)

        phone.close()
        await until(() => !wall.members.includes('web-phone'))
        wall.close()
    })

    it('keeps groups apart: a publish in one group never reaches another', async () => {
        const heard = []
        const other = createMeshClient({ serverUrl, path, group: 'g2', nodeId: 'web-other', WebSocketImpl: WebSocket, onEvent: (m) => heard.push(m) })
        const listener = []
        const same = createMeshClient({ serverUrl, path, group: 'g3', nodeId: 'web-same', WebSocketImpl: WebSocket, onEvent: (m) => listener.push(m) })
        const sender = createMeshClient({ serverUrl, path, group: 'g3', nodeId: 'web-sender', WebSocketImpl: WebSocket })
        await until(() => [other, same, sender].every((c) => c.state === MESH_STATE.UP) && same.members.includes('web-sender'))
        sender.publish('level', 1)
        await until(() => listener.length === 1)
        expect(heard).toEqual([])
        for (const c of [other, same, sender]) c.close()
    })
})
