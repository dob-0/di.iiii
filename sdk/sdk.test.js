// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { connect } from './index.js'
import { MOVES } from './moves.js'
import { ApprovalPending, DiError, createHttp } from './http.js'
import { PUBLIC, PublicMoveRefused, guard, reachOf } from './reach.js'
import { resolveBase, resolveSite, resolveToken } from './credentials.js'
import { detectVersion } from './mcp.mjs'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** A server that answers from a table, and records what it was asked. */
const fakeServer = (routes) => {
    const seen = []
    const fetchImpl = async (url, options = {}) => {
        seen.push({ method: options.method, url, body: options.body })
        const key = `${options.method} ${new URL(url).pathname}`
        const route = routes[key] ?? routes[key.replace(/\/[^/]+$/, '/*')]
        const answer = typeof route === 'function' ? route(options) : route
        if (answer === undefined) return new Response('{"error":"not stubbed"}', { status: 500 })
        const { status = 200, body = {} } = answer
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
    }
    return { fetchImpl, seen }
}

const local = (routes, extra = {}) => {
    const { fetchImpl, seen } = fakeServer(routes)
    return { seen, connect: () => connect({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl, ...extra }) }
}

describe('the gate', () => {
    it('refuses a public move when nothing was wired up to confirm it', async () => {
        const { connect: open } = local({})
        const di = await open()
        await expect(di.run('space.makePublic', { space: 'x' })).rejects.toBeInstanceOf(PublicMoveRefused)
    })

    // The one default that must never be convenient: an agent holding a token,
    // with nobody watching, must not publish by omission.
    it('does not call the server at all when it refuses', async () => {
        const { connect: open, seen } = local({})
        const di = await open()
        await di.run('space.invite', { space: 'x', label: 'a' }).catch(() => {})
        expect(seen).toHaveLength(0)
    })

    it('runs read and private moves without asking', async () => {
        const { connect: open } = local({ 'GET /serverXR/api/spaces': { body: { spaces: [] } } })
        const di = await open()
        await expect(di.run('space.list')).resolves.toEqual([])
    })

    it('treats a refusal that is not exactly true as a refusal', async () => {
        for (const answer of [false, undefined, null, 'yes', 1]) {
            const move = { name: 'm', reach: PUBLIC, opens: () => 'x' }
            await expect(guard({ move, args: {}, confirm: async () => answer })).rejects.toBeInstanceOf(PublicMoveRefused)
        }
    })

    // Creating a space is private; creating a PUBLIC space is not. Reach has to
    // be read from the arguments or the gate can be walked straight past.
    it('reads reach from the arguments where the arguments decide it', () => {
        expect(reachOf(MOVES['space.ensure'], { space: 'x' })).toBe('private')
        expect(reachOf(MOVES['space.ensure'], { space: 'x', isPublic: true })).toBe(PUBLIC)
    })

    it('names the move and what it opens, so the question can be answered', async () => {
        const { connect: open } = local({})
        const di = await open()
        const error = await di.run('space.invite', { space: 'library', label: 'Anna' }).catch((e) => e)
        expect(error.message).toContain('space.invite')
        expect(error.message).toContain('PERMANENT access')
        expect(error.message).toContain('library')
    })

    it('never asks before CLOSING a door', async () => {
        const { connect: open } = local({ 'PATCH /serverXR/api/spaces/x': { body: { space: { id: 'x', isPublic: false } } } })
        const di = await open()
        await expect(di.run('space.makePrivate', { space: 'x' })).resolves.toMatchObject({ isPublic: false })
    })
})

describe('202 is not success', () => {
    it('throws ApprovalPending rather than returning a queued change as done', async () => {
        const { fetchImpl } = fakeServer({ 'PATCH /serverXR/api/spaces/x': { status: 202, body: { status: 'pending_approval' } } })
        const http = createHttp({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl })
        await expect(http.patch('/api/spaces/x', { permanent: true })).rejects.toBeInstanceOf(ApprovalPending)
    })

    it('says a 401 is probably the wrong tier, because it usually is', async () => {
        const { fetchImpl } = fakeServer({ 'GET /serverXR/api/spaces': { status: 401, body: { error: 'Unauthorized' } } })
        const http = createHttp({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl })
        await expect(http.get('/api/spaces')).rejects.toThrow(/another tier/)
    })
})

describe('reading a space', () => {
    it('lists the projects inside it', async () => {
        const { connect: open } = local({
            'GET /serverXR/api/spaces/x/projects': { body: { projects: [{ id: 'p1', slug: 'page', projectMeta: { title: 'A Page' } }] } }
        })
        await expect((await open()).run('project.list', { space: 'x' })).resolves.toEqual([
            { id: 'p1', slug: 'page', title: 'A Page', updatedAt: null }
        ])
    })

    it('is the same reading project.ensure uses, not a second copy of it', async () => {
        const { connect: open, seen } = local({
            'GET /serverXR/api/spaces/x/projects': { body: { projects: [{ id: 'p1' }] } }
        })
        await expect((await open()).run('project.ensure', { space: 'x', project: 'p1' })).resolves.toMatchObject({ created: false })
        expect(seen.filter((s) => s.method === 'POST')).toHaveLength(0)
    })
})

describe('the traps, encoded', () => {
    // The id comes from the LABEL. Hardcoding one created "library" no matter
    // what was asked for, and every later call 404'd against the name asked for.
    it('refuses when the server names the space something other than what was asked', async () => {
        const { connect: open } = local({
            'GET /serverXR/api/spaces/di-library': { status: 404, body: { error: 'not found' } },
            'POST /serverXR/api/spaces': { body: { space: { id: 'library', label: 'Di Library' } } }
        })
        const di = await open()
        await expect(di.run('space.ensure', { space: 'di-library' })).rejects.toThrow(/named it "library"/)
    })

    it('makes every new space permanent, or the 30-day sweep eats it', async () => {
        const { connect: open, seen } = local({
            'GET /serverXR/api/spaces/x': { status: 404, body: {} },
            'POST /serverXR/api/spaces': { body: { space: { id: 'x' } } }
        })
        await (await open()).run('space.ensure', { space: 'x' })
        expect(JSON.parse(seen.at(-1).body)).toMatchObject({ permanent: true })
    })

    // normalizeProjectDocument answers 200 while dropping codeFiles it dislikes.
    it('catches a document the server accepted and silently changed', async () => {
        let stored = '<p>something else</p>'
        const { connect: open } = local({
            'GET /serverXR/api/projects/p/document': () => ({ body: { document: { presentationState: { codeFiles: [{ name: 'index.html', content: stored }] } } } }),
            'PUT /serverXR/api/projects/p/document': { body: { version: 2 } }
        })
        const di = await open()
        await expect(di.run('project.writeHtml', { project: 'p', html: '<p>what I sent</p>' })).rejects.toThrow(/stored something other than what was sent/)
    })

    it('passes when the round trip is byte for byte', async () => {
        const html = '<p>exactly this</p>'
        const { connect: open } = local({
            'GET /serverXR/api/projects/p/document': { body: { document: { presentationState: { codeFiles: [{ name: 'index.html', content: html }] } } } },
            'PUT /serverXR/api/projects/p/document': { body: { version: 3 } }
        })
        await expect((await open()).run('project.writeHtml', { project: 'p', html })).resolves.toMatchObject({ verified: true, version: 3 })
    })

    // Asset ids are per-server. A cache keyed on the project alone let a prod
    // run read the dev tier's cache and publish a page whose every file 404s.
    it('keys the asset cache by host, so one tier cannot read another tier\'s', async () => {
        const store = new Map()
        const cache = { get: async (k) => store.get(k) || null, set: async (k, v) => { store.set(k, v) } }
        const routes = { 'POST /serverXR/api/projects/p/assets': { body: { asset: { id: 'a1', url: '/assets/a1.pdf' } } } }
        const a = fakeServer(routes)
        const b = fakeServer(routes)
        await (await connect({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl: a.fetchImpl, cache }))
            .run('asset.push', { project: 'p', files: [{ name: 'x.pdf', bytes: new Uint8Array([1]) }] })
        await (await connect({ base: 'https://di-studio.xyz/serverXR', token: 't', fetchImpl: b.fetchImpl, cache }))
            .run('asset.push', { project: 'p', files: [{ name: 'x.pdf', bytes: new Uint8Array([1]) }] })
        expect([...store.keys()]).toEqual(['localhost:4000::p::x.pdf', 'di-studio.xyz::p::x.pdf'])
        expect(b.seen.filter((s) => s.method === 'POST')).toHaveLength(1)   // uploaded again, not assumed
    })

    it('spot-checks one cached asset and refuses a cache pointing at another server', async () => {
        const store = new Map([['localhost:4000::p::x.pdf', '/assets/ghost.pdf']])
        const cache = { get: async (k) => store.get(k) || null, set: async () => {} }
        const { fetchImpl } = fakeServer({ 'HEAD /assets/ghost.pdf': { status: 404, body: '' } })
        const di = await connect({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl, cache })
        await expect(di.run('asset.push', { project: 'p', files: [{ name: 'x.pdf', bytes: new Uint8Array([1]) }] }))
            .rejects.toThrow(/cache points at files this server does not have/)
    })
})

describe('credentials', () => {
    // Every project in the estate read the platform's serverXR/.env.local by
    // absolute path. This module exists so that habit has somewhere to go.
    it('never reads a repository — env first, then the user config', () => {
        expect(resolveToken({ tier: 'prod', env: { DI_TOKEN: 'a', DI_TOKEN_PROD: 'b' } })).toBe('a')
        expect(resolveToken({ tier: 'prod', env: { DI_TOKEN_PROD: 'b' } })).toBe('b')
        expect(resolveToken({ tier: 'prod', env: {}, home: '/nonexistent' })).toBeNull()
    })

    it('knows the three tiers by name and refuses a fourth', () => {
        expect(resolveBase({ tier: 'dev' })).toBe('https://dev.diiii.xyz/serverXR')
        expect(resolveSite({ tier: 'dev' })).toBe('https://dev.diiii.xyz')
        expect(resolveToken({ tier: 'dev', env: { DI_TOKEN_DEV: 'd' }, home: '/nonexistent' })).toBe('d')
        // `staging` was the dev tier's old identifier; it is refused, not mapped.
        expect(resolveToken({ tier: 'dev', env: { DI_TOKEN_STAGING: 's' }, home: '/nonexistent' })).toBeNull()
        expect(() => resolveBase({ tier: 'staging' })).toThrow('"staging" is now "dev"')
        expect(() => resolveToken({ tier: 'staging', env: { DI_TOKEN: 'x' } })).toThrow('"staging" is now "dev"')
        expect(() => resolveBase({ tier: 'live' })).toThrow(/unknown tier/)
    })

    it('demands a token for anything not on this machine, and not for loopback', async () => {
        await expect(connect({ tier: 'prod', env: {} })).rejects.toThrow(/no token for prod/)
        await expect(connect({ tier: 'local', env: {} })).resolves.toBeTruthy()
    })
})

// The agent face (sdk/mcp.mjs, sdk/door.js) is tested in sdk/door.test.js.

// An install introduced itself to every MCP client as 0.0.0: the version was
// read from ../package.json, which the packed runtime does not carry. It has
// release.json instead.
describe('what the server says it is', () => {
    const root = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-mcp-version-'))
        return { dir, url: pathToFileURL(`${dir}${path.sep}`) }
    }

    it('reads release.json — the install shape', () => {
        const { dir, url } = root()
        fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ version: '0.4.2-offline.7', schemaVersion: 1 }))
        expect(detectVersion(url)).toBe('0.4.2-offline.7')
    })

    it('reads package.json where there is no release.json — the checkout shape', () => {
        const { dir, url } = root()
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.4.0' }))
        expect(detectVersion(url)).toBe('0.4.0')
    })

    it('prefers release.json when both exist — the packed number, not the repo number', () => {
        const { dir, url } = root()
        fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ version: '1.2.3' }))
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.4.0' }))
        expect(detectVersion(url)).toBe('1.2.3')
    })

    it('falls back to 0.0.0 only when neither file is there', () => {
        expect(detectVersion(root().url)).toBe('0.0.0')
    })

    it('is what a real `node sdk/mcp.mjs` reports on initialize — this checkout\'s package.json', () => {
        // Spawned: under vitest the module's import.meta.url is an http-scheme
        // URL that reaches no file, so the handler in-process always says 0.0.0
        // and proves nothing about what an agent is told.
        const entry = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'mcp.mjs')
        const expected = JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry), '..', 'package.json'), 'utf8')).version
        const result = spawnSync(process.execPath, [entry, '--base', 'http://127.0.0.1:1/serverXR'], {
            encoding: 'utf8',
            timeout: 15000,
            input: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}\n'
        })
        const answer = JSON.parse(result.stdout.trim().split('\n')[0])
        expect(answer.result.serverInfo.version).toBe(expected)
        expect(expected).not.toBe('0.0.0')
    })
})
