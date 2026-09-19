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
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { httpRequest, pinnedLookup } = require('./httpClient.js')

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
