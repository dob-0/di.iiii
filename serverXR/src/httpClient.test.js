// @vitest-environment node
//
// The ADDRESS PIN: `httpRequest`'s `address` option keeps the URL's hostname
// for the Host header while the socket goes to a different IP — the plumbing
// behind `di follow --at`. Proved against a real local http server so the
// integration assertion is about actual bytes on the wire, not a mock of
// node:http; `pinnedLookup` is also tested directly because which of its two
// callback shapes Node calls is decided by Node's own version, not by us —
// a real request only ever exercises whichever one this Node happens to use.
import http from 'node:http'
import net from 'node:net'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { httpRequest, pinnedLookup, pinnedAgents } = require('./httpClient.js')

let server = null
afterEach(async () => {
    if (!server) return
    await new Promise((resolve) => server.close(resolve))
    server = null
})

/** A plain http server bound to loopback, remembering the Host header of the last request it saw. */
const startServer = () => new Promise((resolve) => {
    let lastHost = null
    server = http.createServer((req, res) => {
        lastHost = req.headers.host
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
    })
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, lastHost: () => lastHost }))
})

describe('the address pin, end to end', () => {
    it('connects to `address` while the request URL keeps a made-up hostname', async () => {
        const { port, lastHost } = await startServer()
        // A hostname this machine cannot resolve at all — if the server saw
        // the request, it arrived via the pin, not via DNS.
        const response = await httpRequest(`http://caller.invalid:${port}/api/health`, { address: '127.0.0.1' })
        expect(response.ok).toBe(true)
        expect(response.json()).toEqual({ ok: true })
        // The Host header still carries the made-up name — the name stays,
        // only where the socket connects moved.
        expect(lastHost()).toBe(`caller.invalid:${port}`)
    })

    it('is inert with no address given — the ordinary case is untouched', async () => {
        const { port } = await startServer()
        const response = await httpRequest(`http://127.0.0.1:${port}/api/health`)
        expect(response.ok).toBe(true)
    })
})

/**
 * Can this machine bind a second loopback address? Linux allows the whole
 * 127.0.0.0/8 block; some containers and some CI images do not. Where it
 * cannot, the socket-isolation test below is skipped rather than faked — a
 * mock could not tell us whether Node's real Agent pooling was actually
 * fixed.
 */
const canBindSecondLoopback = () => new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(0, '127.0.0.2', () => probe.close(() => resolve(true)))
})

describe('the address pin does not ride a socket pooled for a different address', () => {
    // Found live: `httpRequest(url, {address: A})` then `httpRequest(url, {address: B})`
    // for the SAME url answered from A's connection both times — Node's Agent
    // pools sockets keyed by host:port, and `lookup` (what the address pin
    // actually changes) is not part of that key, so the second call silently
    // reused the first call's socket instead of ever connecting to B.
    //
    // Two servers on the SAME port, on two different loopback addresses: the
    // port has to be identical or this would only prove the port is part of
    // the pooling key, which nobody disputes — the address pin is what is
    // under test.
    it('two requests pinned to different addresses each reach their own server', async () => {
        if (!(await canBindSecondLoopback())) return // environment cannot alias loopback — nothing to prove here

        const serverA = http.createServer((req, res) => res.end(JSON.stringify({ marker: 'A' })))
        const serverB = http.createServer((req, res) => res.end(JSON.stringify({ marker: 'B' })))
        await new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve))
        const port = serverA.address().port
        await new Promise((resolve, reject) => {
            serverB.once('error', reject)
            serverB.listen(port, '127.0.0.2', resolve)
        })

        try {
            const url = `http://caller.invalid:${port}/x`
            const first = await httpRequest(url, { address: '127.0.0.1' })
            const second = await httpRequest(url, { address: '127.0.0.2' })
            expect(first.json()).toEqual({ marker: 'A' })
            // The bug: without per-address agents, this came back { marker: 'A' }
            // too — the second request never touched 127.0.0.2's socket.
            expect(second.json()).toEqual({ marker: 'B' })
        } finally {
            await new Promise((resolve) => serverA.close(resolve))
            await new Promise((resolve) => serverB.close(resolve))
        }
    })
})

describe('pinnedLookup — both forms Node may call a custom lookup with', () => {
    it('the classic form: callback(err, address, family)', () => {
        const results = []
        pinnedLookup('127.0.0.1')('caller.invalid', {}, (err, address, family) => results.push({ err, address, family }))
        expect(results).toEqual([{ err: null, address: '127.0.0.1', family: 4 }])
    })

    it('the {all: true} form (Node 20+ Happy Eyeballs): callback(err, addresses[])', () => {
        const results = []
        pinnedLookup('127.0.0.1')('caller.invalid', { all: true }, (err, addresses) => results.push({ err, addresses }))
        expect(results).toEqual([{ err: null, addresses: [{ address: '127.0.0.1', family: 4 }] }])
    })

    it('the 2-argument form: (hostname, callback), options omitted entirely', () => {
        const results = []
        pinnedLookup('127.0.0.1')('caller.invalid', (err, address, family) => results.push({ err, address, family }))
        expect(results).toEqual([{ err: null, address: '127.0.0.1', family: 4 }])
    })

    it('reports family 6 for an IPv6 pin, in both forms', () => {
        const classic = []
        pinnedLookup('::1')('caller.invalid', {}, (err, address, family) => classic.push({ err, address, family }))
        expect(classic).toEqual([{ err: null, address: '::1', family: 6 }])

        const all = []
        pinnedLookup('::1')('caller.invalid', { all: true }, (err, addresses) => all.push({ err, addresses }))
        expect(all).toEqual([{ err: null, addresses: [{ address: '::1', family: 6 }] }])
    })
})

// DSC-10 (2026-10-26): a pinned call built `new Agent()`, whose keepAlive is false,
// while every unpinned call rides Node's global agent (keepAlive since v19). So a
// pinned follow opened a new connection — and on https a new handshake — per request.
describe('a pinned address keeps its connection alive, like an unpinned call', () => {
    it('two requests pinned to one address ride one socket', async () => {
        let connections = 0
        const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') })
        server.on('connection', () => { connections += 1 })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const { port } = server.address()
        try {
            const url = `http://kept.invalid:${port}/api/health`
            expect((await httpRequest(url, { address: '127.0.0.1' })).status).toBe(200)
            expect((await httpRequest(url, { address: '127.0.0.1' })).status).toBe(200)
            expect(connections).toBe(1)
            expect(pinnedAgents.get('http:|127.0.0.1').keepAlive).toBe(true)
        } finally {
            for (const agent of pinnedAgents.values()) agent.destroy()
            pinnedAgents.clear()
            server.closeAllConnections?.()
            await new Promise((resolve) => server.close(resolve))
        }
    })
})

// DSC-10, after review: "like an unpinned call" means every option Node's global agent
// has, scheduling 'lifo' included (Node 22: keepAlive, scheduling, timeout, noDelay).
describe('a pinned agent has exactly the options of Node\'s global agent', () => {
    it('http and https, key for key', async () => {
        const https = require('node:https')
        // Nothing listens on port 9 here: each call fails, but its pinned agent is made.
        await httpRequest('http://same.invalid:9/', { address: '127.0.0.1' }).catch(() => {})
        await httpRequest('https://same.invalid:9/', { address: '127.0.0.1' }).catch(() => {})
        try {
            for (const [key, global] of [['http:|127.0.0.1', http.globalAgent], ['https:|127.0.0.1', https.globalAgent]]) {
                const pinned = pinnedAgents.get(key)
                expect(pinned, key).toBeTruthy()
                expect(pinned.options).toEqual(global.options)
            }
        } finally {
            for (const agent of pinnedAgents.values()) agent.destroy()
            pinnedAgents.clear()
        }
    })
})
