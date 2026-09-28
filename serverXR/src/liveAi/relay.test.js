import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { WebSocket, WebSocketServer } = require('ws')
const { attachLiveAiRelay, clientAddress } = require('./relay')

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const close = (server) => new Promise((resolve) => server.close(() => resolve()))
const nextMessage = (socket) => new Promise((resolve) => socket.once('message', (data, isBinary) => resolve({ data, isBinary })))
const opened = (socket) => new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('unexpected-response', (req, res) => reject(Object.assign(new Error('refused'), { status: res.statusCode }))); socket.once('error', reject) })

describe('live-AI relay', () => {
    let server
    let port
    let engine
    let enginePort
    const env = { ...process.env }

    beforeEach(async () => {
        delete process.env.DI_ALLOW_LAN_DEVICES
        process.env.NODE_ENV = 'test'
        engine = new WebSocketServer({ host: '127.0.0.1', port: 0 })
        await new Promise((resolve) => engine.on('listening', resolve))
        enginePort = engine.address().port
        engine.on('connection', (socket) => {
            socket.on('message', (data, isBinary) => socket.send(isBinary ? Buffer.concat([Buffer.from('AI:'), data]) : `echo:${data}`, { binary: isBinary }))
        })
        server = http.createServer()
        attachLiveAiRelay(server, { paths: ['/liveai'], getEngineUrl: () => `ws://127.0.0.1:${enginePort}` })
        port = await listen(server)
    })

    afterEach(async () => {
        Object.assign(process.env, env)
        for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]
        await close(server)
        await new Promise((resolve) => engine.close(resolve))
    })

    it('passes frames and params both ways, untouched', async () => {
        const page = new WebSocket(`ws://127.0.0.1:${port}/liveai`)
        await opened(page)
        page.send(JSON.stringify({ type: 'params', prompt: 'gold' }))
        expect(String((await nextMessage(page)).data)).toBe('echo:{"type":"params","prompt":"gold"}')
        page.send(Buffer.from('frame-1'), { binary: true })
        const reply = await nextMessage(page)
        expect(reply.isBinary).toBe(true)
        expect(String(reply.data)).toBe('AI:frame-1')
        page.close()
    })

    it('says why, in words, when no engine is listening', async () => {
        await new Promise((resolve) => engine.close(resolve))
        const page = new WebSocket(`ws://127.0.0.1:${port}/liveai`)
        await opened(page)
        const message = JSON.parse(String((await nextMessage(page)).data))
        expect(message).toMatchObject({ type: 'status', state: 'no-engine' })
        expect(message.detail).toMatch(/no live-AI engine at ws:\/\/127\.0\.0\.1/)
        // re-open a server so afterEach can close it
        engine = new WebSocketServer({ host: '127.0.0.1', port: 0 })
        await new Promise((resolve) => engine.on('listening', resolve))
    })

    it('does not exist on a hosted tier (404)', async () => {
        process.env.NODE_ENV = 'production'
        delete process.env.DI_LOCAL
        const page = new WebSocket(`ws://127.0.0.1:${port}/liveai`)
        await expect(opened(page)).rejects.toMatchObject({ status: 404 })
    })

    it('leaves other upgrade paths alone', async () => {
        // Stand-in for the mesh hub, which owns /mesh on the real server: it
        // answers after the relay has had its chance to (not) claim the socket.
        let seenByOthers = false
        server.on('upgrade', (req, socket) => {
            if (req.url.startsWith('/liveai')) return
            seenByOthers = true
            setTimeout(() => socket.destroy(), 50)
        })
        const page = new WebSocket(`ws://127.0.0.1:${port}/mesh`)
        page.on('error', () => {})
        const outcome = await new Promise((resolve) => {
            page.once('open', () => resolve('opened'))
            setTimeout(() => resolve('untouched'), 300)
        })
        expect(outcome).toBe('untouched')
        expect(seenByOthers).toBe(true)
        page.terminate()
    })
})

describe('clientAddress (upgrade requests never see Express trust proxy)', () => {
    const req = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} })

    it('is the peer when the peer is not this machine', () => {
        expect(clientAddress(req('192.168.1.20', '127.0.0.1'))).toBe('192.168.1.20')
    })

    it('believes X-Forwarded-For only through a proxy on this machine (a phone via Vite)', () => {
        expect(clientAddress(req('127.0.0.1', '192.168.1.44'))).toBe('192.168.1.44')
    })

    it('is loopback for the machine itself', () => {
        expect(clientAddress(req('::1'))).toBe('::1')
        expect(clientAddress(req('127.0.0.1', '127.0.0.1'))).toBe('127.0.0.1')
    })
})
