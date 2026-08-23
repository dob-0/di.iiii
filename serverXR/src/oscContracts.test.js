import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import dgram from 'node:dgram'
import express from 'express'

const require = createRequire(import.meta.url)
const { registerOscRoutes, __closeAllSockets } = require('./routes/oscRoutes.js')

// A real UDP listener. Asserting that the route returns 200 would pass on an
// encoder that sends nothing, to the wrong port, in the wrong byte order —
// which is the entire class of bug that matters when the receiver is a light.
const listen = () => new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const received = []
    socket.on('message', (msg) => received.push(msg))
    socket.bind(0, '127.0.0.1', () => resolve({ socket, received, port: socket.address().port }))
})

const serve = (app) => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

describe('POST /api/local/osc', () => {
    let listener, http, base, priorLocal, priorEnv

    beforeAll(async () => {
        priorLocal = process.env.DI_LOCAL
        priorEnv = process.env.NODE_ENV
        // The case the old guard got wrong: a REAL `di up` install runs
        // NODE_ENV=production with DI_LOCAL=1, and must still reach devices.
        process.env.DI_LOCAL = '1'
        process.env.NODE_ENV = 'production'
        listener = await listen()
        const app = express()
        app.use(express.json())
        const router = express.Router()
        registerOscRoutes(router)
        app.use(router)
        http = await serve(app)
        base = `http://127.0.0.1:${http.port}`
    })

    afterAll(async () => {
        __closeAllSockets()
        listener?.socket.close()
        await new Promise((resolve) => http.server.close(resolve))
        if (priorLocal === undefined) delete process.env.DI_LOCAL; else process.env.DI_LOCAL = priorLocal
        if (priorEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorEnv
    })

    it('delivers real OSC bytes to a real UDP socket', async () => {
        const res = await fetch(`${base}/api/local/osc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: '127.0.0.1', port: listener.port, address: '/light/1/intensity', args: [0.75] })
        })
        expect(res.status).toBe(200)
        await settle()
        expect(listener.received.length).toBe(1)
        const packet = listener.received[0]
        expect(packet.subarray(0, 19).toString()).toBe('/light/1/intensity\0')
        expect(packet.toString('binary')).toContain(',f')
        // 0.75 big-endian float
        expect(packet.subarray(-4).toString('hex')).toBe('3f400000')
    })

    it('serves an OSC install on a di up install (NODE_ENV=production + DI_LOCAL=1)', async () => {
        const res = await fetch(`${base}/api/local/capabilities`)
        const body = await res.json()
        expect(body.local).toBe(true)
        expect(body.capabilities.osc).toBe(true)
        // Named honestly as absent rather than omitted, so a node can say why.
        expect(body.capabilities.ndi).toBe(false)
    })

    it('refuses a bad address with the reason, not a 500', async () => {
        const res = await fetch(`${base}/api/local/osc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: '127.0.0.1', port: listener.port, address: 'no-slash', args: [1] })
        })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/must start with/)
    })

    it('refuses an impossible port before opening a socket', async () => {
        const res = await fetch(`${base}/api/local/osc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: '127.0.0.1', port: 0, address: '/a', args: [1] })
        })
        expect(res.status).toBe(400)
    })

    it('reuses one socket for repeated sends to the same target', async () => {
        const { __sockets } = require('./routes/oscRoutes.js')
        const before = __sockets.size
        for (let i = 0; i < 5; i += 1) {
            await fetch(`${base}/api/local/osc`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ host: '127.0.0.1', port: listener.port, address: '/f', args: [i / 10] })
            })
        }
        expect(__sockets.size).toBe(Math.max(before, 1))
    })
})

describe('the local runtime gate', () => {
    let http, base, priorLocal, priorEnv

    beforeAll(async () => {
        priorLocal = process.env.DI_LOCAL
        priorEnv = process.env.NODE_ENV
        // A hosted di-studio.xyz: production, and no DI_LOCAL.
        delete process.env.DI_LOCAL
        process.env.NODE_ENV = 'production'
        const app = express()
        app.use(express.json())
        const router = express.Router()
        registerOscRoutes(router)
        app.use(router)
        http = await serve(app)
        base = `http://127.0.0.1:${http.port}`
    })

    afterAll(async () => {
        await new Promise((resolve) => http.server.close(resolve))
        if (priorLocal === undefined) delete process.env.DI_LOCAL; else process.env.DI_LOCAL = priorLocal
        if (priorEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorEnv
    })

    it('404s the send route on a hosted server — it does not admit the route exists', async () => {
        const res = await fetch(`${base}/api/local/osc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ host: '127.0.0.1', port: 9000, address: '/a', args: [1] })
        })
        expect(res.status).toBe(404)
    })

    it('still answers capabilities, saying no — a node needs to know WHY it is dark', async () => {
        const res = await fetch(`${base}/api/local/capabilities`)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.local).toBe(false)
        expect(body.capabilities.osc).toBe(false)
    })
})
