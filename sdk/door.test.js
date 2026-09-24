// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { DiError } from './http.js'
import { MAX_TEXT, buildIndex, callOne, describe as describeName, find, gate, pickFrom, resolveRefs, routeEntries, runSteps, shape } from './door.js'
import { createDoor } from './mcp.mjs'

const require = createRequire(import.meta.url)
const catalogue = require('../serverXR/src/catalogue/index.js')

// A small catalogue in exactly the shape the server serves, made by the
// server's own openapi() — so this file breaks if the two ever drift apart.
const ENTRIES = {
    spaces: [
        { route: 'GET /api/spaces', summary: 'list the spaces this caller can see', reach: 'read', role: 'viewer', agent: true },
        { route: 'GET /api/spaces/:spaceId/projects', summary: 'list the projects inside a space', reach: 'read', role: 'viewer', agent: true,
          input: { query: { type: 'object', properties: { limit: { type: 'number' } } } } },
        { route: 'PATCH /api/spaces/:spaceId', summary: 'change a space\'s label or settings', reach: 'private', role: 'editor', agent: true,
          input: { body: { type: 'object', properties: { label: { type: 'string' } } } } },
        { route: 'POST /api/spaces/:spaceId/publish', summary: 'make a space readable by anyone', reach: 'public', role: 'editor', agent: true }
    ]
}
const DOC = catalogue.openapi({ list: catalogue.load(ENTRIES) })
const index = () => buildIndex(DOC)

const fakeDi = (answer = async (method, p, o) => ({ status: 200, body: { method, path: p, sent: o.body ?? null } })) => ({
    run: vi.fn(async (name, args) => ({ move: name, args })),
    request: vi.fn(answer)
})

describe('the catalogue the server serves is the catalogue the door reads', () => {
    it('turns every operation into an entry with its name, route and reach', () => {
        const routes = routeEntries(DOC)
        expect(routes.map((r) => r.name).sort()).toEqual(['get_spaces', 'get_spaces_projects', 'patch_spaces_by_spaceid', 'post_spaces_publish'])
        const projects = routes.find((r) => r.name === 'get_spaces_projects')
        expect(projects).toMatchObject({ method: 'GET', path: '/api/spaces/{spaceId}/projects', pathParams: ['spaceId'], reach: 'read' })
        expect(projects.query.properties.limit.type).toBe('number')
    })
})

describe('di_find', () => {
    it('answers an empty question with what there is, by area, so the next question can be a good one', () => {
        const out = find(index(), {})
        expect(out.areas.spaces).toBeGreaterThan(0)
        expect(out.moves.some((m) => m.name === 'space.list')).toBe(true)
    })

    it('finds by plain words and puts the shortcut moves first', () => {
        const out = find(index(), { query: 'list projects in a space' })
        expect(out.results[0].kind).toBe('move')
        expect(out.results.map((r) => r.name)).toContain('get_spaces_projects')
    })

    it('pages instead of flooding the conversation', () => {
        const first = find(index(), { query: 'space', limit: 2 })
        expect(first.results).toHaveLength(2)
        expect(first.nextCursor).toBe('2')
        const second = find(index(), { query: 'space', limit: 2, cursor: first.nextCursor })
        expect(second.results[0].name).not.toBe(first.results[0].name)
    })
})

describe('di_describe', () => {
    it('gives a route\'s params, inputs, reach and a call ready to fill in', () => {
        const d = describeName(index(), 'patch_spaces_by_spaceid')
        expect(d).toMatchObject({ route: 'PATCH /api/spaces/{spaceId}', reach: 'private', params: ['spaceId'] })
        expect(d.body.properties.label.type).toBe('string')
        expect(d.call).toEqual({ name: 'patch_spaces_by_spaceid', params: { spaceId: '<spaceId>' }, body: {} })
    })

    it('says what to do when a name does not exist', () => {
        expect(() => describeName(index(), 'nope')).toThrow(/di_find first/)
    })
})

describe('the public gate', () => {
    const publish = () => index().byName.get('post_spaces_publish')

    it('refuses outright when the person who launched it did not allow public moves', () => {
        expect(gate({ entry: publish(), call: {}, confirm: true, allowPublic: false })).toMatch(/^REFUSED/)
    })

    it('holds for a yes even when allowed, and says to ask the person', () => {
        expect(gate({ entry: publish(), call: {}, confirm: false, allowPublic: true })).toMatch(/^NOT DONE.*\n[\s\S]*Tell the person/)
    })

    it('lets a confirmed public call through only when allowed', () => {
        expect(gate({ entry: publish(), call: {}, confirm: true, allowPublic: true })).toBeNull()
    })

    it('never asks about reads or private writes', () => {
        expect(gate({ entry: index().byName.get('patch_spaces_by_spaceid'), call: {}, allowPublic: false })).toBeNull()
    })

    it('reads a move\'s reach from its arguments', () => {
        const ensure = index().byName.get('space.ensure')
        expect(gate({ entry: ensure, call: { args: { space: 'x' } }, allowPublic: false })).toBeNull()
        expect(gate({ entry: ensure, call: { args: { space: 'x', isPublic: true } }, allowPublic: false })).toMatch(/^REFUSED/)
    })

    it('does not reach the server at all when it refuses', async () => {
        const di = fakeDi()
        const door = createDoor({ env: {}, connectImpl: async () => ({ ...di, request: vi.fn(async (m, p) => (p === '/api/catalogue' ? { status: 200, body: DOC } : di.request(m, p))) }) })
        const out = await door.call({ name: 'post_spaces_publish', params: { spaceId: 'x' } })
        expect(out.isError).toBe(true)
        expect(di.request).not.toHaveBeenCalled()
    })
})

describe('di_call', () => {
    it('fills path params (encoded), adds the query, and sends a body only when the method has one', async () => {
        const di = fakeDi()
        const get = await callOne(di, index().byName.get('get_spaces_projects'), { params: { spaceId: 'a b' }, query: { limit: 5 } })
        expect(get.body).toEqual({ method: 'GET', path: '/api/spaces/a%20b/projects?limit=5', sent: null })
        const patch = await callOne(di, index().byName.get('patch_spaces_by_spaceid'), { params: { spaceId: 'x' }, body: { label: 'X' } })
        expect(patch.body.sent).toEqual({ label: 'X' })
    })

    it('names the missing param instead of calling a broken URL', async () => {
        await expect(callOne(fakeDi(), index().byName.get('patch_spaces_by_spaceid'), {})).rejects.toThrow(/needs params\.spaceId/)
    })

    it('runs a move through the SDK, where its traps are', async () => {
        const di = fakeDi()
        await callOne(di, index().byName.get('space.list'), { args: {} })
        expect(di.run).toHaveBeenCalledWith('space.list', {})
    })
})

describe('di_run', () => {
    it('feeds one step\'s answer into the next', async () => {
        const di = fakeDi(async (method, p) => (p === '/api/spaces'
            ? { status: 200, body: { spaces: [{ id: 'main' }] } }
            : { status: 200, body: { path: p } }))
        const out = await runSteps(di, index(), {
            steps: [
                { name: 'get_spaces', as: 'all' },
                { name: 'get_spaces_projects', params: { spaceId: '${all.body.spaces.0.id}' } }
            ]
        })
        expect(out.failed).toBeUndefined()
        expect(out.results.s2.body.path).toBe('/api/spaces/main/projects')
    })

    it('stops at the first failure and says what ran, what failed and what never started', async () => {
        const di = fakeDi(async (method, p) => {
            if (p.includes('boom')) throw new DiError('PATCH → 500')
            return { status: 200, body: {} }
        })
        const out = await runSteps(di, index(), {
            steps: [
                { name: 'get_spaces' },
                { name: 'patch_spaces_by_spaceid', params: { spaceId: 'boom' } },
                { name: 'get_spaces' }
            ]
        })
        expect(out.done.map((d) => d.step)).toEqual([1])
        expect(out.failed).toMatchObject({ step: 2, name: 'patch_spaces_by_spaceid' })
        expect(out.notRun).toEqual(['get_spaces'])
    })

    it('refuses the whole run before the first call when any step opens a door unconfirmed', async () => {
        const di = fakeDi()
        const out = await runSteps(di, index(), { steps: [{ name: 'get_spaces' }, { name: 'post_spaces_publish', params: { spaceId: 'x' } }] })
        expect(out.refused.step).toBe(2)
        expect(di.request).not.toHaveBeenCalled()
    })

    it('only lets a step use results of steps before it', () => {
        expect(() => resolveRefs('${later.id}', {})).toThrow(/has not run/)
        expect(resolveRefs('space ${a.id}!', { a: { id: 'x' } })).toBe('space x!')
    })
})

describe('pick — only what was asked for reaches the model', () => {
    const answer = { status: 200, body: { scene: { objects: [{ type: 'video', id: 'a' }, { type: 'image', id: 'b' }], backgroundColor: '#000' } } }

    it('maps a path over a list at []', () => {
        expect(pickFrom(answer, ['body.scene.objects[].type'])).toEqual({ 'body.scene.objects[].type': ['video', 'image'] })
    })

    it('takes several paths at once and leaves a missing one undefined, not an error', () => {
        const out = pickFrom(answer, ['body.scene.backgroundColor', 'body.nope.deeper'])
        expect(out['body.scene.backgroundColor']).toBe('#000')
        expect(out['body.nope.deeper']).toBeUndefined()
    })

    it('reports a picked step in a run, while later steps still see the whole answer', async () => {
        const di = fakeDi(async (method, p) => (p === '/api/spaces'
            ? { status: 200, body: { spaces: [{ id: 'main', label: 'Main' }] } }
            : { status: 200, body: { path: p } }))
        const out = await runSteps(di, index(), {
            steps: [
                { name: 'get_spaces', as: 'all', pick: ['body.spaces[].label'] },
                { name: 'get_spaces_projects', params: { spaceId: '${all.body.spaces.0.id}' } }
            ]
        })
        expect(out.results.all).toEqual({ 'body.spaces[].label': ['Main'] })
        expect(out.results.s2.body.path).toBe('/api/spaces/main/projects')
    })
})

describe('what an answer costs', () => {
    it('cuts a huge answer and says how to ask for less', () => {
        const out = shape({ items: 'x'.repeat(MAX_TEXT * 2) })
        expect(out.text.length).toBeLessThan(MAX_TEXT + 400)
        expect(out.text).toMatch(/TRUNCATED/)
        expect(out.structured).toMatchObject({ truncated: true, keys: ['items'] })
    })
})

describe('an older server, with no catalogue', () => {
    it('still offers the moves, and says why the routes are missing', async () => {
        const door = createDoor({
            env: {},
            connectImpl: async () => ({ run: vi.fn(), request: async () => { throw new DiError('404', { status: 404 }) } })
        })
        const out = await door.find({})
        expect(out.structuredContent.note).toMatch(/predates the catalogue/)
        expect(out.structuredContent.moves.length).toBeGreaterThan(0)
    })
})

describe('over a real stdio pipe', () => {
    it('serves the 2025-era handshake and exactly four tools', async () => {
        const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp.mjs')
        const child = spawn(process.execPath, [entry, '--base', 'http://127.0.0.1:1/serverXR'], { stdio: ['pipe', 'pipe', 'pipe'] })
        const lines = []
        let buffer = ''
        const got = new Promise((resolve) => {
            child.stdout.on('data', (chunk) => {
                buffer += chunk
                let cut
                while ((cut = buffer.indexOf('\n')) !== -1) {
                    lines.push(JSON.parse(buffer.slice(0, cut)))
                    buffer = buffer.slice(cut + 1)
                    if (lines.length === 2) resolve()
                }
            })
        })
        const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
        send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
        send({ method: 'notifications/initialized' })
        send({ id: 2, method: 'tools/list' })
        await got
        child.kill()
        expect(lines[0].result.protocolVersion).toBe('2025-11-25')
        expect(lines[1].result.tools.map((t) => t.name)).toEqual(['di_find', 'di_describe', 'di_call', 'di_run'])
    }, 15000)

    // The hand-rolled server echoed whatever version a client asked for; the
    // spec says a server answers with a version it actually supports.
    it('never claims a protocol version it does not speak', () => {
        const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp.mjs')
        const result = spawnSync(process.execPath, [entry, '--base', 'http://127.0.0.1:1/serverXR'], {
            encoding: 'utf8',
            timeout: 15000,
            input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1900-01-01', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })}\n`
        })
        const answer = JSON.parse(result.stdout.trim().split('\n')[0])
        expect(answer.result.protocolVersion).not.toBe('1900-01-01')
        expect(answer.result.protocolVersion).toMatch(/^20\d\d-\d\d-\d\d$/)
    }, 15000)
})
