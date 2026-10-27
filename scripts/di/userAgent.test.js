// Every request `di` makes to another di.iiii names itself, in the form that
// install's visitor bouncer (serverXR/src/appVisitors.js) counts as an
// identified app — 300 API reads a minute instead of an anonymous program's 30.
// Seen 2026-10-20 on one install: the auto-update failing with 429.

import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { createRequire } from 'node:module'

import { hubCommit } from './channels.mjs'
import { checkFollowable, instanceOf, resolveBase } from './share.mjs'
import { fetchJson, resolveRemoteBase } from './sync.mjs'
import { DI_USER_AGENT, DI_USER_AGENT_CONTACT, diUserAgent, withUserAgent } from './userAgent.mjs'

const require = createRequire(import.meta.url)
const { classifyUserAgent } = require('../../serverXR/src/appVisitors.js')
const serverSide = require('../../serverXR/src/diUserAgent.js')

const servers = []
afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

// A di.iiii that answers health and an op log, and writes down every User-Agent and credential it is sent.
const fakeDi = () => new Promise((resolve) => {
    const seen = []
    const server = http.createServer((req, res) => {
        seen.push({ url: req.url, ua: req.headers['user-agent'] ?? null, auth: req.headers.authorization ?? null })
        res.setHeader('Content-Type', 'application/json')
        if (req.url.startsWith('/serverXR/api/health')) res.end(JSON.stringify({ ok: true, startedAt: 't1', port: 1 }))
        else if (req.url.includes('/ops')) res.end(JSON.stringify({ ops: [], latestVersion: 3 }))
        else res.end('{}')
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, seen }))
})

describe('the header', () => {
    it('is counted as an identified app by the real classifier', () => {
        expect(classifyUserAgent(DI_USER_AGENT)).toEqual({ kind: 'app', name: 'di.iiii', contact: DI_USER_AGENT_CONTACT })
    })

    it("is the one serverXR sends, for the same version", () => {
        for (const version of [null, '0.4.16-connect.4']) expect(diUserAgent(version)).toBe(serverSide.diUserAgent(version))
    })

    it("without it, Node's own fetch is counted as anonymous", () => {
        expect(classifyUserAgent('node').kind).toBe('anonymous')
        expect(classifyUserAgent('').kind).toBe('anonymous')
    })

    it('a request that names its own User-Agent keeps it', () => {
        expect(withUserAgent({ 'user-agent': 'x/1' })).toEqual({ 'user-agent': 'x/1' })
    })
})

describe('every path to another di.iiii sends it', () => {
    it("the auto-update's health read (#1053's hubCommit), retries included", async () => {
        const sent = []
        let n = 0
        const fetchImpl = async (url, init) => {
            sent.push(init.headers['User-Agent'])
            n += 1
            return n === 1
                ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } })
                : new Response(JSON.stringify({ release: { gitCommit: 'a'.repeat(40) } }), { status: 200 })
        }
        await hubCommit({ hub: 'https://hub.invalid', fetchImpl, sleep: async () => {} })
        expect(sent).toEqual([DI_USER_AGENT, DI_USER_AGENT])
    })

    it('di sync and di link (fetchJson, injected), with the credential kept', async () => {
        const sent = []
        const fetchImpl = async (url, init) => { sent.push(init.headers); return new Response('{}') }
        await fetchJson('https://far.invalid/serverXR/api/spaces/jam/ops', { token: 'k', fetchImpl })
        expect(sent).toEqual([{ Accept: 'application/json', Authorization: 'Bearer k', 'User-Agent': DI_USER_AGENT }])
    })

    it('di sync and di link (resolveRemoteBase, on a real socket)', async () => {
        const { port, seen } = await fakeDi()
        expect(await resolveRemoteBase(`http://127.0.0.1:${port}`)).toMatch(/^http:\/\/127\.0\.0\.1:/)
        expect(seen.length).toBeGreaterThan(0)
        expect(seen.every((s) => s.ua === DI_USER_AGENT)).toBe(true)
    })

    it("di follow's checks, through fetch and through the address pin, sync key kept", async () => {
        const { port, seen } = await fakeDi()
        await resolveBase(`http://127.0.0.1:${port}`)
        await instanceOf(`http://127.0.0.1:${port}/serverXR`)
        await checkFollowable({ base: `http://127.0.0.1:${port}/serverXR`, spaceId: 'jam', key: 'sync-key' })
        const fetched = seen.length
        await checkFollowable({ base: `http://pinned.invalid:${port}/serverXR`, spaceId: 'jam', key: 'sync-key', address: '127.0.0.1' })
        expect(seen.length).toBeGreaterThan(fetched)
        expect(seen.every((s) => s.ua === DI_USER_AGENT)).toBe(true)
        expect(seen.filter((s) => s.url.includes('/ops')).map((s) => s.auth)).toEqual(['Bearer sync-key', 'Bearer sync-key'])
    })
})
