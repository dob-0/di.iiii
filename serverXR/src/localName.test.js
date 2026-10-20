// @vitest-environment node
//
// The door for the one local address (serverXR/src/localName.js): a second
// listener on loopback that hands requests and upgrades to the main server,
// serves the exact name only, and stands aside — never fails — when the port
// is taken or not allowed.
import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import net from 'node:net'

import localName from './localName.js'

const { hostIs, localNameConfig, startLocalName, stopLocalName, urlFor } = localName

const cleanups = []
afterEach(() => { for (const c of cleanups.splice(0)) c() })

const freePort = () => new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
})
const get = (port, host, path = '/serverXR/api/health') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
})
const upgrade = (port, host) => new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`))
    let got = ''
    s.on('data', (d) => { got += d })
    s.on('close', () => resolve(got))
    s.on('error', () => resolve(got))
    setTimeout(() => s.destroy(), 1500)
})
// The main server: an ordinary http.Server whose handlers the door must reach.
const mainServer = () => {
    const seen = []
    const s = http.createServer((req, res) => { seen.push(req.headers.host); res.end(`main saw ${req.headers.host} ${req.url}`) })
    s.on('upgrade', (req, socket) => socket.end(`HTTP/1.1 101 Switching Protocols\r\nX-Main: ${req.headers.host}\r\n\r\n`))
    return { s, seen }
}

describe('localNameConfig: on only for a personal install that asks by name', () => {
    it('needs DI_LOCAL=1 and a DI_LOCAL_NAME', () => {
        expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: 'diiii.localhost' })).toEqual({ name: 'diiii.localhost', port: 80 })
        // test servers, rig members, scratch copies: DI_LOCAL=1 but no name → no door
        expect(localNameConfig({ DI_LOCAL: '1' })).toBeNull()
        expect(localNameConfig({ DI_LOCAL_NAME: 'diiii.localhost' })).toBeNull()
        for (const off of ['off', 'OFF', '0', 'false', 'no']) expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: off })).toBeNull()
    })
    it('serves .localhost names only, and a valid port', () => {
        expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: 'diiii.xyz' })).toBeNull()
        expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: 'evil.localhost.example' })).toBeNull()
        expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: 'diiii.localhost', DI_LOCAL_NAME_PORT: '8080' })).toEqual({ name: 'diiii.localhost', port: 8080 })
        expect(localNameConfig({ DI_LOCAL: '1', DI_LOCAL_NAME: 'diiii.localhost', DI_LOCAL_NAME_PORT: '70000' })).toBeNull()
    })
    it('the url carries no :80', () => {
        expect(urlFor({ name: 'diiii.localhost', port: 80 })).toBe('http://diiii.localhost/')
        expect(urlFor({ name: 'diiii.localhost', port: 8080 })).toBe('http://diiii.localhost:8080/')
    })
})

describe('hostIs: the exact name, any port, trailing dot — nothing else (DNS rebinding)', () => {
    it.each([
        ['diiii.localhost', true], ['diiii.localhost:80', true], ['DIIII.LOCALHOST', true], ['diiii.localhost.', true],
        ['x.diiii.localhost', false], ['localhost', false], ['127.0.0.1', false], ['evil.example', false], ['[::1]:80', false], ['', false], [undefined, false]
    ])('%s → %s', (host, want) => expect(hostIs(host, 'diiii.localhost')).toBe(want))
})

describe('startLocalName: one app behind two doors', () => {
    it('hands requests and upgrades for the name to the main server; 421 for any other Host', async () => {
        const { s, seen } = mainServer()
        const port = await freePort()
        const state = await startLocalName({ mainServer: s, config: { name: 'diiii.localhost', port }, hosts: ['127.0.0.1'] })
        cleanups.push(() => stopLocalName(state))
        expect(state.served).toEqual(['127.0.0.1'])
        expect(state.aside).toEqual([])
        const a = await get(port, 'diiii.localhost')
        expect(a).toEqual({ status: 200, body: 'main saw diiii.localhost /serverXR/api/health' })
        const b = await get(port, 'attacker.example')
        expect(b.status).toBe(421)
        expect(seen).toEqual(['diiii.localhost'])
        expect(await upgrade(port, 'diiii.localhost')).toMatch(/^HTTP\/1\.1 101[\s\S]*X-Main: diiii\.localhost/)
        expect(await upgrade(port, 'attacker.example')).toBe('')
    })

    it('stands aside by name when the port is taken, and the start goes on', async () => {
        const taken = http.createServer((req, res) => res.end('the dev-router'))
        await new Promise((r) => taken.listen(0, '127.0.0.1', r))
        cleanups.push(() => taken.close())
        const port = taken.address().port
        const lines = []
        const state = await startLocalName({ mainServer: mainServer().s, config: { name: 'diiii.localhost', port }, hosts: ['127.0.0.1'], log: (l) => lines.push(l) })
        expect(state.served).toEqual([])
        expect(state.aside).toEqual([{ host: '127.0.0.1', code: 'EADDRINUSE', reason: expect.stringMatching(/held by another program/) }])
        expect(lines.join('\n')).toMatch(/standing aside/)
        expect((await get(port, 'diiii.localhost')).body).toBe('the dev-router')
    })

    it('names EACCES as the owner\'s permission step', async () => {
        const fakeCreate = () => {
            const ee = new http.Server()
            ee.listen = function () { process.nextTick(() => this.emit('error', Object.assign(new Error('denied'), { code: 'EACCES' }))); return this }
            return ee
        }
        const state = await startLocalName({ mainServer: mainServer().s, config: { name: 'diiii.localhost', port: 80 }, hosts: ['127.0.0.1', '::1'], createServer: fakeCreate })
        expect(state.aside.map((a) => a.code)).toEqual(['EACCES', 'EACCES'])
        expect(state.aside[0].reason).toMatch(/cap_net_bind_service/)
    })

    it('does nothing at all when not configured', async () => {
        expect(await startLocalName({ mainServer: mainServer().s, config: null })).toBeNull()
    })
})
