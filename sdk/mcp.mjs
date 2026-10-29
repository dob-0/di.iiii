#!/usr/bin/env node
/**
 * di.iiii as an MCP server — the agent door. Spec: docs/architecture/SPEC_agent_door.md.
 *
 *   claude mcp add di -- node /path/to/di.iiii/sdk/mcp.mjs --tier local
 *   di mcp                                   (from an install)
 *
 * Four tools: di_find, di_describe, di_call, di_run. Everything the server's
 * catalogue opens to agents is reachable through them, and nothing costs the
 * conversation a schema until the agent asks for it. The logic is sdk/door.js;
 * this file is only the wiring.
 *
 * Plus four read-only rig tools (sdk/rig.js, spec §5.1): di_rig_versions,
 * di_rig_check, di_rig_truss, di_production_archive_plan. They read the
 * checkout's rig files (and, for the archive plan, one GET); none writes.
 *
 * Plus di_context: the one context at the token's level (GET /ai/context on
 * the server, serverXR/src/aiContext.js). The server decides the level from
 * the token; asking above it is the server's 403, shown as is.
 *
 * Two transports. stdio, for a client on the same machine (the default). And
 * remote HTTP (`--http <port>`), for an assistant that can only add a door by
 * URL: each request must carry `Authorization: Bearer <act token>` (a di.bo
 * act token, dii_tgact_…), and that token, never the launcher's, is what the
 * door acts with. See serveHttp below for what the remote door leaves out.
 *
 * Protocol: the official SDK, @modelcontextprotocol/server (pinned exact in
 * package.json and serverXR/package.json), serving MCP 2026-07-28 and the
 * 2025-era `initialize` handshake from one factory (serveStdio). The earlier
 * hand-rolled JSON-RPC echoed back whatever version a client asked for, which
 * the spec forbids, and predated the 2026-07-28 change.
 *
 * Credentials come from the environment, as the MCP spec asks of a stdio
 * server: DI_TOKEN / DI_TOKEN_<TIER> / ~/.config/di/credentials.json
 * (sdk/credentials.js). Never from a repository.
 *
 * ── the safety story, plainly ──
 * The server is the protection: it refuses whatever the token may not do.
 * On top of that, a public move — one that opens a door to someone new — is
 * refused here outright unless the person who launched this set
 * DI_MCP_ALLOW_PUBLIC=1, and even then each call must carry confirm: true.
 * An agent left running unattended cannot publish, mint an access link or
 * delete a space by default.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { connect } from './index.js'
import { buildIndex, callOne, describe, find, gate, pickFrom, runSteps, shape } from './door.js'
import { archivePlan, rigCheck, rigTruss, rigVersions } from './rig.js'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}

// What this build is, for serverInfo. An install has release.json at its root
// and no package.json; a checkout has package.json. release.json wins where
// both exist: package.json carries the repo's number, not the released one.
export const detectVersion = (root) => {
    for (const file of ['release.json', 'package.json']) {
        try {
            const version = JSON.parse(readFileSync(new URL(file, root), 'utf8')).version
            if (version) return String(version)
        } catch { /* not this one */ }
    }
    return '0.0.0'
}
const VERSION = detectVersion(new URL('../', import.meta.url))

// The SDK lives in the checkout's node_modules, or — on an install, where only
// serverXR/ is `npm ci`'d — in serverXR/node_modules. Plain resolution first,
// then serverXR's, so `di mcp` works on an artist's machine and not only here.
export const loadSdk = async (subpath = '') => {
    const id = `@modelcontextprotocol/server${subpath ? `/${subpath}` : ''}`
    try {
        return await import(/* @vite-ignore */ id)
    } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
        const serverRequire = createRequire(new URL('../serverXR/package.json', import.meta.url))
        const pkgDir = path.dirname(serverRequire.resolve('@modelcontextprotocol/server'))
        const pkgJson = JSON.parse(readFileSync(path.join(pkgDir, '..', 'package.json'), 'utf8'))
        const target = pkgJson.exports[subpath ? `./${subpath}` : '.'].import.default
        return import(/* @vite-ignore */ pathToFileURL(path.join(pkgDir, '..', target)).href)
    }
}

const INSTRUCTIONS =
    'di.iiii — spaces, projects, scenes, pages and files on a di.iiii server. ' +
    'Start with di_find (words, or nothing for an overview), then di_describe the name you want, then di_call it. ' +
    'Chain several calls with di_run instead of calling one by one, and use pick to take only the fields you need from a big answer. Names of kind "move" are shortcuts that carry ' +
    'known traps (id from label, read-back after write, 202 = queued); prefer them when one fits. ' +
    'Anything that opens a door — making a space public, minting an invite link, deleting — must be put to the ' +
    'person in words before you call it. ' +
    'For a production\'s rig (MOXIR), use di_rig_versions, di_rig_truss and di_rig_check instead of reading the rig JSON; ' +
    'di_production_archive_plan shows what an archive would change and changes nothing. ' +
    'di_context returns what di.iiii is and how its words are used, at the level of your key; read it first when you need background.'

const ok = (value) => {
    const { text, structured } = shape(value)
    return { content: [{ type: 'text', text }], structuredContent: structured }
}
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true })
const failWith = (error) => fail(`${error.name || 'Error'}: ${error.message}`)

const CALL_SHAPE = {
    name: { type: 'string', description: 'a name from di_find / di_describe' },
    params: { type: 'object', description: 'route path parameters, e.g. { "spaceId": "main" }' },
    query: { type: 'object', description: 'route query parameters' },
    body: { type: 'object', description: 'route JSON body' },
    args: { type: 'object', description: 'a move\'s arguments (kind "move" only)' },
    pick: {
        type: 'array',
        items: { type: 'string' },
        description: 'return only these paths of the answer, e.g. ["body.scene.objects[].type"] — [] maps over a list. Use it on anything big.'
    }
}
const CONFIRM = {
    type: 'boolean',
    description: 'Only for something that opens a door, and only true if the person you are working for said yes to it IN THIS CONVERSATION.'
}

/**
 * The door over a live di.iiii. `connectImpl` and `env` are seams for tests.
 * Returns the four handlers, so tests can drive them without a transport.
 */
export const createDoor = ({ tier, base, token, env = process.env, connectImpl = connect } = {}) => {
    let di = null
    let index = null
    let catalogueNote = null
    const client = async () => (di ||= await connectImpl({
        tier, base, token, env,
        // The door decides about public moves before the SDK is asked.
        confirm: async () => true
    }))
    const allowPublic = () => env.DI_MCP_ALLOW_PUBLIC === '1'

    const loadIndex = async ({ refresh = false } = {}) => {
        if (index && !refresh) return index
        const d = await client()
        let doc = null
        try {
            doc = (await d.request('GET', '/api/catalogue')).body
            catalogueNote = null
        } catch (error) {
            // An older server has no catalogue. The moves still work; say so
            // once, rather than failing the whole door.
            if (error?.status !== 404) throw error
            catalogueNote = 'this server predates the catalogue (GET /api/catalogue is 404) — only the moves are available'
        }
        index = buildIndex(doc)
        return index
    }

    return {
        find: async ({ query = '', limit, cursor, refresh = false } = {}) => {
            try {
                const result = find(await loadIndex({ refresh }), { query, limit, cursor })
                return ok(catalogueNote ? { ...result, note: catalogueNote } : result)
            } catch (error) { return failWith(error) }
        },
        describe: async ({ name }) => {
            try { return ok(describe(await loadIndex(), name)) } catch (error) { return failWith(error) }
        },
        call: async ({ confirm, ...call }) => {
            try {
                const idx = await loadIndex()
                const entry = idx.byName.get(call.name)
                if (!entry) return fail(`no such name "${call.name}" — di_find first; names come from its results`)
                const refusal = gate({ entry, call, confirm, allowPublic: allowPublic() })
                if (refusal) return fail(refusal)
                return ok(pickFrom(await callOne(await client(), entry, call), call.pick))
            } catch (error) { return failWith(error) }
        },
        // The rig tools: read-only. Only the archive plan touches the server, with one GET.
        rigVersions: async (input = {}) => { try { return ok(await rigVersions(input)) } catch (error) { return failWith(error) } },
        rigCheck: async (input = {}) => { try { return ok(await rigCheck(input)) } catch (error) { return failWith(error) } },
        rigTruss: async (input = {}) => { try { return ok(await rigTruss(input)) } catch (error) { return failWith(error) } },
        archivePlan: async (input = {}) => { try { return ok(await archivePlan(await client(), input)) } catch (error) { return failWith(error) } },
        // The one context at this token's level. The level is the server's to
        // decide; a level above the token's comes back as its 403, as an error.
        context: async ({ level } = {}) => {
            try {
                const query = level ? `?level=${encodeURIComponent(String(level))}` : ''
                const res = await (await client()).request('GET', `/ai/context${query}`, { raw: true })
                const text = await res.text()
                if (!res.ok) {
                    let detail = text
                    try {
                        const body = JSON.parse(text)
                        detail = body.error === 'level_refused'
                            ? `level_refused: your key reaches "${body.yours}", not "${body.level}"`
                            : body.error || text
                    } catch { /* plain text */ }
                    return fail(`GET /ai/context${query} → ${res.status}: ${String(detail).slice(0, 300)}`)
                }
                return {
                    content: [{ type: 'text', text }],
                    structuredContent: {
                        level: res.headers.get('x-di-context-level'),
                        yours: res.headers.get('x-di-context-yours'),
                        built: res.headers.get('x-di-context-built')
                    }
                }
            } catch (error) { return failWith(error) }
        },
        run: async ({ steps, confirm }) => {
            try {
                const outcome = await runSteps(await client(), await loadIndex(), { steps, confirm, allowPublic: allowPublic() })
                const { text, structured } = shape(outcome)
                return { content: [{ type: 'text', text }], structuredContent: structured, isError: Boolean(outcome.failed || outcome.refused) }
            } catch (error) { return failWith(error) }
        }
    }
}

/**
 * One McpServer with the tools — the factory serveStdio pins per connection,
 * and serveHttp builds per request. `rig: false` leaves the rig tools out:
 * they read the checkout of the machine the door runs on, which for a remote
 * door is the host's, not the caller's.
 */
export const createMcpServer = (door, { McpServer, fromJsonSchema }, { rig = true } = {}) => {
    const schema = (properties, required = []) => fromJsonSchema({ type: 'object', properties, required, additionalProperties: false })
    const server = new McpServer({ name: 'di.iiii', version: VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS })

    server.registerTool('di_find', {
        title: 'Find what di.iiii can do',
        description: 'Search everything this di.iiii server lets you do, by words. Empty query: an overview by area plus the shortcut moves. Returns names, one line each.',
        inputSchema: schema({
            query: { type: 'string', description: 'plain words, e.g. "projects in a space", "upload file", "scene"' },
            limit: { type: 'number', description: 'at most this many results (default 15, max 50)' },
            cursor: { type: 'string', description: 'nextCursor from the previous page' },
            refresh: { type: 'boolean', description: 'reread the catalogue from the server' }
        }),
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    }, (input) => door.find(input))

    server.registerTool('di_describe', {
        title: 'Describe one thing di.iiii can do',
        description: 'Full detail for one name from di_find: what it takes, how far it reaches, any trap, and a ready call to fill in.',
        inputSchema: schema({ name: { type: 'string', description: 'a name from di_find' } }, ['name']),
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    }, (input) => door.describe(input))

    server.registerTool('di_call', {
        title: 'Do one thing on di.iiii',
        description: 'Run one name from di_find. Routes take params/query/body; moves take args. Reach is shown by di_describe; anything public needs the person\'s yes.',
        inputSchema: schema({ ...CALL_SHAPE, confirm: CONFIRM }, ['name']),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    }, (input) => door.call(input))

    server.registerTool('di_run', {
        title: 'Do several things on di.iiii in order',
        description: 'Run up to 20 calls in order in one go. Give a step "as": "x" and later steps can use "${x.body.id}". Stops at the first failure and reports what ran and what did not.',
        inputSchema: schema({
            steps: {
                type: 'array',
                items: { type: 'object', properties: { ...CALL_SHAPE, as: { type: 'string', description: 'a short name later steps can refer to' } }, required: ['name'] }
            },
            confirm: CONFIRM
        }, ['steps']),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    }, (input) => door.run(input))

    server.registerTool('di_context', {
        title: 'Read di.iiii\'s context at your level',
        description: 'What di.iiii is, the words it uses and how it works, as markdown, at the level your key reaches (public with none). level asks for a lower one; asking above yours is refused.',
        inputSchema: schema({
            level: { type: 'string', enum: ['public', 'registered', 'partner', 'crew', 'core', 'owner'], description: 'a level at or below your key\'s (default: your own)' }
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, (input) => door.context(input))

    if (!rig) return server

    // ── the rig tools: read only, nothing here writes (spec §5.1) ──
    const LOCAL_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    const PRODUCTION = { type: 'string', description: 'the production\'s set id or a unique prefix, e.g. "moxir" (default: the only one)' }
    const RIG_VERSION = { type: 'string', description: 'a version, variant or candidate id from di_rig_versions, e.g. "known-full"' }

    server.registerTool('di_rig_versions', {
        title: 'List a production\'s rig versions',
        description: 'Every version, variant and candidate of a production\'s rig: id, title, truss kind, fixture counts by code, lamps, effects, looks. Read from the committed versions and rig files instead of reading them whole.',
        inputSchema: schema({ production: PRODUCTION }),
        annotations: LOCAL_READ
    }, (input) => door.rigVersions(input))

    server.registerTool('di_rig_check', {
        title: 'Run the rig\'s safety checks',
        description: 'Run the existing rig checks on the committed files and return pass/fail with numbers: generated files fresh, bridle angles within limit, every look built with nothing refused or clashing, lasers at least 3 m up and rising, the ground-mover policy. Geometry only; a human signs the rigging.',
        inputSchema: schema({
            production: PRODUCTION,
            version: { ...RIG_VERSION, description: 'check only this one (default: all, a few seconds)' },
            hall: { type: 'string', description: 'check against another committed hall file in scripts/place/rigs (default: the hall each rig names)' }
        }),
        annotations: LOCAL_READ
    }, (input) => door.rigCheck(input))

    server.registerTool('di_rig_truss', {
        title: 'Show one version\'s truss',
        description: 'The truss of one version: ends, picks with kg and bridle angles, tie-offs, load and sign-off, plus the bridle check against its hall. detail: true returns the whole truss block with every reason and source.',
        inputSchema: schema({ production: PRODUCTION, version: RIG_VERSION, detail: { type: 'boolean', description: 'include every why/source/basis/note field' } }, ['version']),
        annotations: LOCAL_READ
    }, (input) => door.rigTruss(input))

    server.registerTool('di_production_archive_plan', {
        title: 'Plan which projects to archive (dry run)',
        description: 'What scripts/production/archive-versions.mjs would do in a space: keep these projects, archive and hide the rest. Reads the space\'s project list with one GET and changes nothing; applying it is the owner\'s command, given in the answer.',
        inputSchema: schema({
            space: { type: 'string', description: 'the space id, e.g. "moxir"' },
            keep: { type: 'array', items: { type: 'string' }, description: 'project ids to keep' }
        }, ['space', 'keep']),
        annotations: { ...LOCAL_READ, openWorldHint: true }
    }, (input) => door.archivePlan(input))

    return server
}

export const serve = async (options = {}) => {
    const sdk = await loadSdk()
    const { serveStdio } = await loadSdk('stdio')
    const door = createDoor(options)
    return serveStdio(() => createMcpServer(door, sdk), {
        onerror: (error) => process.stderr.write(`[di mcp] ${error?.message || error}\n`)
    })
}

// ── the remote door ──
// A di.bo act token is the only key it takes: short (15 minutes at most),
// one person's, and re-read by the server on every request, tier included
// (serverXR/src/actTokenTier.js). The door verifies nothing itself beyond the
// shape — the server is the protection, as on stdio — but it never falls back
// to a token of its own: no key, no door.
export const ACT_TOKEN_PREFIX = 'dii_tgact_'
const bearerOf = (headers) => {
    const raw = headers.get('authorization') || ''
    const match = /^Bearer\s+(\S+)$/i.exec(raw.trim())
    return match ? match[1] : null
}
const refuse = (status, error, message) => new Response(JSON.stringify({ error, message }), {
    status,
    headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...(status === 401 ? { 'www-authenticate': 'Bearer realm="di.iiii", error="invalid_token"' } : {})
    }
})

/**
 * The remote door as a web-standard handler: (Request) => Response. Each
 * request gets a door that acts with ITS bearer token. What it leaves out of
 * the stdio door, on purpose: the rig tools (they would read this host's
 * checkout), and public moves, which are refused whatever the host's env says
 * (DI_MCP_ALLOW_PUBLIC means "the person who launched me said yes", and the
 * person on the other end of a URL did not launch it).
 */
export const createHttpDoor = ({ base, tier = null, sdk, connectImpl = connect, path: mount = '/mcp', onerror } = {}) => {
    if (!base && !tier) throw new Error('the remote door needs --base (the di.iiii API it fronts) or --tier')
    const { McpServer, fromJsonSchema, createMcpHandler } = sdk
    const doorEnv = { ...process.env, DI_MCP_ALLOW_PUBLIC: '0', DI_TOKEN: '' }
    const handler = createMcpHandler(({ authInfo }) => createMcpServer(
        createDoor({ tier, base, token: authInfo?.token, env: doorEnv, connectImpl }),
        { McpServer, fromJsonSchema },
        { rig: false }
    ), { onerror })
    // Path and key, judged from the head alone: the adapter asks this before
    // it reads a byte of the body, so a stranger cannot make the door buffer.
    const precheck = (url, headers) => {
        const { pathname } = new URL(url)
        if (pathname !== mount && pathname !== `${mount}/`) return refuse(404, 'not_found', `the door is at ${mount}`)
        const token = bearerOf(headers)
        if (!token) return refuse(401, 'auth_required', 'Send Authorization: Bearer <act token>.')
        if (!token.startsWith(ACT_TOKEN_PREFIX)) return refuse(401, 'act_token_required', 'This door takes a di.bo act token (dii_tgact_…), nothing else.')
        return null
    }
    return {
        precheck,
        fetch: async (request) => {
            const refused = precheck(request.url, request.headers)
            if (refused) return refused
            return handler.fetch(request, { authInfo: { token: bearerOf(request.headers), clientId: 'di.bo', scopes: [] } })
        },
        close: () => handler.close()
    }
}

// The most a request body may be: the SDK's own default bound (4 MiB). Over it
// is a 413, decided from Content-Length when there is one and by counting when
// there is not, and reading stops there.
export const MAX_BODY_BYTES = 4 * 1024 * 1024

const sendResponse = async (res, response) => {
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) {
        for await (const chunk of response.body) res.write(chunk)
    }
    res.end()
}

// node:http in, web Request/Response through, node:http out — streaming, so
// an SSE answer reaches the client as it is written. The door's precheck runs
// on the head before the body is read.
export const toNodeListener = (door, { maxBodyBytes = MAX_BODY_BYTES } = {}) => async (req, res) => {
    try {
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) value.forEach((v) => headers.append(name, v))
            else if (value !== undefined) headers.set(name, value)
        }
        const url = `http://${req.headers.host || 'localhost'}${req.url}`
        const refused = door.precheck ? door.precheck(url, headers) : null
        if (refused) {
            res.setHeader('connection', 'close')
            return await sendResponse(res, refused)
        }
        const tooBig = () => {
            res.writeHead(413, { 'content-type': 'application/json', connection: 'close' })
            res.end(JSON.stringify({ error: 'too_large', message: `at most ${maxBodyBytes} bytes` }))
            req.destroy()
        }
        if (Number(req.headers['content-length'] || 0) > maxBodyBytes) return tooBig()
        const chunks = []
        let size = 0
        for await (const chunk of req) {
            size += chunk.length
            if (size > maxBodyBytes) return tooBig()
            chunks.push(chunk)
        }
        const body = chunks.length ? Buffer.concat(chunks) : null
        await sendResponse(res, await door.fetch(new Request(url, {
            method: req.method,
            headers,
            ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {})
        })))
    } catch (error) {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'door_error', message: String(error?.message || error) }))
    }
}

export const serveHttp = async ({ port = 8787, host = '127.0.0.1', base = null, tier = null, connectImpl } = {}) => {
    const { createServer } = await import('node:http')
    const sdk = await loadSdk()
    const door = createHttpDoor({
        base, tier, sdk, connectImpl,
        onerror: (error) => process.stderr.write(`[di mcp http] ${error?.message || error}\n`)
    })
    // Slow clients do not hold a socket open: the head in 10 s, the whole
    // request in 30 s.
    const server = createServer({ headersTimeout: 10_000, requestTimeout: 30_000 }, toNodeListener(door))
    await new Promise((resolve) => server.listen(port, host, resolve))
    return { server, door, url: `http://${host}:${server.address().port}/mcp` }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (arg('http')) {
        const { url } = await serveHttp({ port: Number(arg('http')), host: arg('host', '127.0.0.1'), base: arg('base'), tier: arg('tier') })
        process.stderr.write(`[di mcp http] the door is at ${url} — each request must carry Authorization: Bearer <act token>\n`)
    } else {
        await serve({ tier: arg('tier', 'local'), base: arg('base'), token: arg('token') })
    }
}
