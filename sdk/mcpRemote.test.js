// @vitest-environment node
//
// The remote MCP door (sdk/mcp.mjs serveHttp) and its di_context tool, over a
// real HTTP port, in front of a stand-in di.iiii that judges tokens by tier
// the way serverXR does (actTokenTier.js, aiContext.js). What it proves:
// the handshake works over HTTP; no key, or a key that is not an act token,
// gets no door; the caller's own token — never the launcher's — is what
// reaches di.iiii; a tier's refusal comes back as the tool's error; and a
// public move stays refused whatever the host's env says.

import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serveHttp } from './mcp.mjs'

const require = createRequire(import.meta.url)
const catalogue = require('../serverXR/src/catalogue/index.js')

const DOC = catalogue.openapi({
    list: catalogue.load({
        spaces: [
            { route: 'GET /api/spaces', summary: 'list the spaces this caller can see', reach: 'read', role: 'viewer', agent: true },
            { route: 'POST /api/spaces/:spaceId/publish', summary: 'make a space readable by anyone', reach: 'public', role: 'editor', agent: true }
        ]
    })
})

const LEVELS = ['public', 'registered', 'partner', 'crew', 'core', 'owner']
const TOKENS = {
    'dii_tgact_root.s': 'owner',
    'dii_tgact_admin.s': 'core',
    'dii_tgact_member.s': 'registered'
}

// A di.iiii that knows three act tokens, one per tier.
const startFakeDi = async () => {
    const seen = []
    const server = createServer((req, res) => {
        const auth = req.headers.authorization || ''
        const token = auth.replace(/^Bearer /, '')
        seen.push({ method: req.method, url: req.url, token })
        const yours = TOKENS[token] || (token ? null : 'public')
        const send = (status, body, headers = {}) => {
            res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/markdown; charset=utf-8' : 'application/json', ...headers })
            res.end(typeof body === 'string' ? body : JSON.stringify(body))
        }
        if (yours === null) return send(401, { error: 'auth_required' })
        const url = new URL(req.url, 'http://x')
        if (url.pathname === '/serverXR/api/catalogue') return send(200, DOC)
        if (url.pathname === '/serverXR/api/spaces') return yours === 'registered' ? send(200, [{ id: 'mine' }]) : send(200, [{ id: 'mine' }, { id: 'theirs' }])
        if (url.pathname === '/serverXR/ai/context') {
            const asked = url.searchParams.get('level') || yours
            if (LEVELS.indexOf(asked) > LEVELS.indexOf(yours)) return send(403, { error: 'level_refused', level: asked, yours })
            return send(200, `# context — ${asked}\n`, { 'x-di-context-level': asked, 'x-di-context-yours': yours })
        }
        return send(404, { error: 'not found' })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return { server, seen, base: `http://127.0.0.1:${server.address().port}/serverXR` }
}

let fakeDi
let door
const savedEnv = {}
beforeEach(async () => {
    // The host that runs the door has its own key and has said yes to public
    // moves for ITSELF. Neither may reach a remote caller.
    for (const k of ['DI_TOKEN', 'DI_MCP_ALLOW_PUBLIC']) savedEnv[k] = process.env[k]
    process.env.DI_TOKEN = 'dii_tgact_root.s'
    process.env.DI_MCP_ALLOW_PUBLIC = '1'
    fakeDi = await startFakeDi()
    door = await serveHttp({ port: 0, base: fakeDi.base })
})
afterEach(async () => {
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    await door.door.close()
    await new Promise((resolve) => door.server.close(resolve))
    await new Promise((resolve) => fakeDi.server.close(resolve))
})

// One JSON-RPC message over the door; the answer may be JSON or one SSE event.
let nextId = 1
const rpc = async (method, params = {}, { token = 'dii_tgact_member.s', url = door.url } = {}) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2025-11-25',
            ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
    })
    const text = await res.text()
    let message = null
    if (res.ok) {
        const data = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
        message = JSON.parse(data || text)
    }
    return { status: res.status, headers: res.headers, text, message }
}
const INIT = { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } }
const callTool = (name, args, opts) => rpc('tools/call', { name, arguments: args }, opts)

describe('the remote door: handshake', () => {
    it('answers initialize over HTTP with a protocol version it speaks', async () => {
        const { status, message } = await rpc('initialize', INIT)
        expect(status).toBe(200)
        expect(message.result.protocolVersion).toBe('2025-11-25')
        expect(message.result.serverInfo.name).toBe('di.iiii')
    })

    it('lists the door tools and di_context, and no rig tools (they would read the host\'s checkout)', async () => {
        const { message } = await rpc('tools/list')
        const names = message.result.tools.map((t) => t.name)
        expect(names).toEqual(['di_find', 'di_describe', 'di_call', 'di_run', 'di_context'])
        expect(message.result.tools.find((t) => t.name === 'di_context').annotations).toMatchObject({ readOnlyHint: true })
    })
})

describe('the remote door: who gets in', () => {
    it('no key: 401 with a Bearer challenge, and di.iiii is never asked', async () => {
        const res = await rpc('initialize', INIT, { token: null })
        expect(res.status).toBe(401)
        expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /)
        expect(fakeDi.seen).toEqual([])
    })

    it.each([
        ['an API key', 'test-api-token'],
        ['a terminal login', 'dii_cli_abc.def'],
        ['a sync key', 'dii_sync_abc']
    ])('%s is not an act token: 401', async (_label, token) => {
        const res = await rpc('initialize', INIT, { token })
        expect(res.status).toBe(401)
        expect(JSON.parse(res.text).error).toBe('act_token_required')
    })

    it('anywhere but /mcp is a 404', async () => {
        const res = await rpc('initialize', INIT, { url: door.url.replace('/mcp', '/other') })
        expect(res.status).toBe(404)
    })

    it('acts with the caller\'s token, never the host\'s DI_TOKEN', async () => {
        await callTool('di_find', {}, { token: 'dii_tgact_member.s' })
        expect(fakeDi.seen.length).toBeGreaterThan(0)
        expect(new Set(fakeDi.seen.map((s) => s.token))).toEqual(new Set(['dii_tgact_member.s']))
    })
})

describe('di_context, by tier', () => {
    it.each([
        ['dii_tgact_member.s', 'registered'],
        ['dii_tgact_admin.s', 'core'],
        ['dii_tgact_root.s', 'owner']
    ])('%s gets its own level by default (%s)', async (token, level) => {
        const { message } = await callTool('di_context', {}, { token })
        expect(message.result.isError).toBeFalsy()
        expect(message.result.content[0].text).toBe(`# context — ${level}\n`)
        expect(message.result.structuredContent).toMatchObject({ level, yours: level })
    })

    it('a member asking for core or owner is refused, and gets none of it', async () => {
        for (const level of ['crew', 'core', 'owner']) {
            const { message } = await callTool('di_context', { level }, { token: 'dii_tgact_member.s' })
            expect(message.result.isError, level).toBe(true)
            expect(message.result.content[0].text).toMatch(/403: level_refused: your key reaches "registered"/)
            expect(message.result.content[0].text).not.toContain('# context')
        }
    })

    it('an admin may ask for a lower level, and not for owner', async () => {
        const lower = await callTool('di_context', { level: 'public' }, { token: 'dii_tgact_admin.s' })
        expect(lower.message.result.content[0].text).toBe('# context — public\n')
        const higher = await callTool('di_context', { level: 'owner' }, { token: 'dii_tgact_admin.s' })
        expect(higher.message.result.isError).toBe(true)
    })

    it('a level that is not one is refused by the tool\'s own schema', async () => {
        const { message } = await callTool('di_context', { level: 'root' }, { token: 'dii_tgact_root.s' })
        expect(message.error || message.result?.isError).toBeTruthy()
        expect(fakeDi.seen.some((s) => s.url.includes('level=root'))).toBe(false)
    })
})

describe('public moves through the remote door', () => {
    it('are refused even for root, even with confirm, even when the host set DI_MCP_ALLOW_PUBLIC=1', async () => {
        const { message } = await callTool('di_call', { name: 'post_spaces_publish', params: { spaceId: 'mine' }, confirm: true }, { token: 'dii_tgact_root.s' })
        expect(message.result.isError).toBe(true)
        expect(message.result.content[0].text).toMatch(/^REFUSED\. post_spaces_publish opens a door/)
        expect(fakeDi.seen.some((s) => s.method === 'POST')).toBe(false)
    })
})
