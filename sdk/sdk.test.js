import { describe, expect, it, vi } from 'vitest'
import { connect } from './index.js'
import { MOVES } from './moves.js'
import { ApprovalPending, DiError, createHttp } from './http.js'
import { PUBLIC, PublicMoveRefused, guard, reachOf } from './reach.js'
import { resolveBase, resolveToken } from './credentials.js'
import { createHandler, describeTools, inputSchema, moveName, toolName } from './mcp.mjs'

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
    // run read staging's cache and publish a page whose every file 404s.
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
        expect(resolveBase({ tier: 'staging' })).toBe('https://staging.di-studio.xyz/serverXR')
        expect(() => resolveBase({ tier: 'live' })).toThrow(/unknown tier/)
    })

    it('demands a token for anything not on this machine, and not for loopback', async () => {
        await expect(connect({ tier: 'prod', env: {} })).rejects.toThrow(/no token for prod/)
        await expect(connect({ tier: 'local', env: {} })).resolves.toBeTruthy()
    })
})

describe('the agent face', () => {
    it('offers every move as a tool, with the dots turned into underscores', () => {
        const tools = describeTools()
        expect(tools).toHaveLength(Object.keys(MOVES).length)
        expect(toolName('space.makePublic')).toBe('space_makePublic')
        expect(moveName('space_makePublic')).toBe('space.makePublic')
        expect(moveName('space.makePublic')).toBe('space.makePublic')
    })

    it('tells an agent, in the tool description, what a move would open', () => {
        const invite = describeTools().find((t) => t.name === 'space_invite')
        expect(invite.description).toContain('OPENS A DOOR')
        expect(invite.inputSchema.properties.confirm).toBeTruthy()
        expect(describeTools().find((t) => t.name === 'space_list').annotations.readOnlyHint).toBe(true)
    })

    it('asks only for what a move needs', () => {
        expect(inputSchema(MOVES['space.get'])).toMatchObject({ required: ['space'] })
        expect(inputSchema(MOVES['space.ensure']).required).toEqual(['space'])
    })

    // The default is not "ask" — it is no. An unattended agent cannot publish.
    it('refuses public moves outright unless the person running it opted in', async () => {
        const handle = await createHandler({ env: {}, connectImpl: async () => ({ run: vi.fn() }) })
        const out = await handle({ id: 1, method: 'tools/call', params: { name: 'space_makePublic', arguments: { space: 'x', confirm: true } } })
        expect(out.result.isError).toBe(true)
        expect(out.result.content[0].text).toContain('REFUSED')
        expect(out.result.content[0].text).toContain('DI_MCP_ALLOW_PUBLIC=1')
    })

    it('still requires an explicit confirm once they have', async () => {
        process.env.DI_MCP_ALLOW_PUBLIC = '1'
        try {
            const run = vi.fn().mockResolvedValue({ ok: true })
            const handle = await createHandler({ connectImpl: async () => ({ run }) })
            const held = await handle({ id: 1, method: 'tools/call', params: { name: 'space_makePublic', arguments: { space: 'x' } } })
            expect(held.result.isError).toBe(true)
            expect(held.result.content[0].text).toContain('NOT DONE')
            expect(run).not.toHaveBeenCalled()

            const done = await handle({ id: 2, method: 'tools/call', params: { name: 'space_makePublic', arguments: { space: 'x', confirm: true } } })
            expect(done.result.isError).toBeFalsy()
            expect(run).toHaveBeenCalledWith('space.makePublic', { space: 'x' })
        } finally { delete process.env.DI_MCP_ALLOW_PUBLIC }
    })

    it('answers initialize and ping, and refuses a method it does not know', async () => {
        const handle = await createHandler({ connectImpl: async () => ({ run: vi.fn() }) })
        expect((await handle({ id: 1, method: 'initialize', params: {} })).result.serverInfo.name).toBe('di.iiii')
        expect((await handle({ id: 2, method: 'ping' })).result).toEqual({})
        expect((await handle({ id: 3, method: 'nope' })).error.code).toBe(-32601)
    })

    it('reports a server error as an error result, not a dead connection', async () => {
        const handle = await createHandler({ connectImpl: async () => ({ run: async () => { throw new DiError('boom', { status: 500 }) } }) })
        const out = await handle({ id: 1, method: 'tools/call', params: { name: 'space_list', arguments: {} } })
        expect(out.result.isError).toBe(true)
        expect(out.result.content[0].text).toContain('boom')
    })
})
