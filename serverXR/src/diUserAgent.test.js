// @vitest-environment node

// Every request serverXR makes to another di.iiii must be counted there as an
// identified app, not as an anonymous program (30 reads a minute against 300).
// The header is checked against the REAL classifier and bouncer, and on a real
// socket, so a change on either side of the wire fails here.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { DI_USER_AGENT, DI_USER_AGENT_CONTACT, diUserAgent, readPackedVersion, withDiUserAgent } = require('./diUserAgent.js')
const { ANONYMOUS_READS_PER_MINUTE, classifyUserAgent, createVisitorBouncer, createVisitorRecorder } = require('./appVisitors.js')
const { httpRequest, httpDownloadToFile, httpUploadFile } = require('./httpClient.js')
const { joinSpace } = require('./follow/join.js')

const servers = []
afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

const listen = (app) => new Promise((resolve) => {
    const server = http.createServer(app)
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})

// A server that writes down the User-Agent of everything it is sent.
const recordingServer = async () => {
    const seen = []
    const base = await listen((req, res) => {
        seen.push({ method: req.method, url: req.url, ua: req.headers['user-agent'] ?? null })
        req.resume()
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('{"ok":true}')
        })
    })
    return { base, seen }
}

describe('the header di.iiii sends', () => {
    it('is counted as an identified app by the real classifier', () => {
        const visitor = classifyUserAgent(DI_USER_AGENT)
        expect(visitor.kind).toBe('app')
        expect(visitor.name).toBe('di.iiii')
        expect(visitor.contact).toBe(DI_USER_AGENT_CONTACT)
    })

    it('stays identified whatever a release.json says the version is', () => {
        for (const version of [null, '', '0.4.16-connect.4', 'v1 beta (x)', '((', 'a/b;c', '-1']) {
            expect(classifyUserAgent(diUserAgent(version)).kind).toBe('app')
        }
    })

    it('without it, what Node sends is still counted as anonymous', () => {
        expect(classifyUserAgent(undefined).kind).toBe('anonymous')
        expect(classifyUserAgent('node').kind).toBe('anonymous')
        expect(classifyUserAgent('di.iiii-join/1').kind).toBe('anonymous')
    })

    it('reads the packed release number, and says dev without one', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-ua-'))
        const file = path.join(dir, 'release.json')
        fs.writeFileSync(file, JSON.stringify({ version: '0.4.16-connect.4' }))
        expect(readPackedVersion(file)).toBe('0.4.16-connect.4')
        expect(readPackedVersion(path.join(dir, 'missing.json'))).toBe(null)
        expect(diUserAgent(null)).toBe(`di.iiii/dev (+${DI_USER_AGENT_CONTACT})`)
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('a caller that names its own User-Agent keeps it, in any spelling', () => {
        expect(withDiUserAgent({ 'user-agent': 'x/1' })).toEqual({ 'user-agent': 'x/1' })
        expect(withDiUserAgent({ Authorization: 'Bearer k' })).toEqual({ Authorization: 'Bearer k', 'User-Agent': DI_USER_AGENT })
    })
})

describe('every outbound request carries it (httpClient, on a real socket)', () => {
    it('httpRequest — the follower, machine links, rig hello — sends it and keeps the credential', async () => {
        const seen = []
        const base = await listen((req, res) => {
            seen.push({ ua: req.headers['user-agent'], auth: req.headers.authorization })
            res.end('{}')
        })
        await httpRequest(`${base}/api/health`)
        await httpRequest(`${base}/api/spaces/s/ops`, { headers: { Authorization: 'Bearer sync-key' } })
        await httpRequest(`${base}/x`, { headers: { 'User-Agent': 'their-own/1' } })
        expect(seen).toEqual([
            { ua: DI_USER_AGENT, auth: undefined },
            { ua: DI_USER_AGENT, auth: 'Bearer sync-key' },
            { ua: 'their-own/1', auth: undefined }
        ])
    })

    it('the file chase: download and upload send it', async () => {
        const { base, seen } = await recordingServer()
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-ua-'))
        const source = path.join(dir, 'in.bin')
        fs.writeFileSync(source, 'abc')
        await httpDownloadToFile(`${base}/api/assets/a`, { destPath: path.join(dir, 'out.bin') })
        await httpUploadFile(`${base}/api/assets`, { filePath: source, method: 'PUT', headers: { 'Content-Length': 3 } })
        fs.rmSync(dir, { recursive: true, force: true })
        expect(seen.map((s) => s.ua)).toEqual([DI_USER_AGENT, DI_USER_AGENT])
    })

    it('join (an injected client) names it too', async () => {
        const sent = []
        const send = async (url, init) => {
            sent.push(init.headers['User-Agent'])
            return { ok: false, status: 404, json: () => ({}) }
        }
        await joinSpace({ address: 'http://127.0.0.1:1', code: 'a b c d', send }).catch(() => {})
        expect(sent.length).toBeGreaterThan(0)
        expect(new Set(sent)).toEqual(new Set([DI_USER_AGENT]))
    })
})

describe("another di.iiii's real bouncer", () => {
    // The recorder and the bouncer exactly as index.js mounts them, counted as a
    // visitor from outside (X-Forwarded-For), with a fake guest book.
    const bouncedServer = () => {
        const guestBook = { record: () => {}, isBlocked: () => false }
        const app = express()
        app.use(createVisitorRecorder({ guestBook }))
        app.use(createVisitorBouncer({ guestBook }))
        app.get('/api/health', (req, res) => res.json({ ok: true }))
        return listen(app)
    }
    const reads = async (base, headers, count) => {
        const statuses = []
        for (let i = 0; i < count; i += 1) {
            statuses.push((await httpRequest(`${base}/api/health`, { headers: { 'X-Forwarded-For': '203.0.113.7', ...headers } })).status)
        }
        return statuses
    }

    it(`lets di.iiii past the ${ANONYMOUS_READS_PER_MINUTE}-a-minute anonymous allowance`, async () => {
        const base = await bouncedServer()
        const statuses = await reads(base, {}, ANONYMOUS_READS_PER_MINUTE + 10)
        expect(statuses.filter((s) => s === 200)).toHaveLength(ANONYMOUS_READS_PER_MINUTE + 10)
    })

    it(`still stops an anonymous program at ${ANONYMOUS_READS_PER_MINUTE}`, async () => {
        const base = await bouncedServer()
        const statuses = await reads(base, { 'User-Agent': 'node' }, ANONYMOUS_READS_PER_MINUTE + 10)
        expect(statuses.filter((s) => s === 200)).toHaveLength(ANONYMOUS_READS_PER_MINUTE)
        expect(statuses.filter((s) => s === 429)).toHaveLength(10)
    })
})
