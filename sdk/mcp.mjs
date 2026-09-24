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
    'person in words before you call it.'

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
        run: async ({ steps, confirm }) => {
            try {
                const outcome = await runSteps(await client(), await loadIndex(), { steps, confirm, allowPublic: allowPublic() })
                const { text, structured } = shape(outcome)
                return { content: [{ type: 'text', text }], structuredContent: structured, isError: Boolean(outcome.failed || outcome.refused) }
            } catch (error) { return failWith(error) }
        }
    }
}

/** One McpServer with the four tools — the factory serveStdio pins per connection. */
export const createMcpServer = (door, { McpServer, fromJsonSchema }) => {
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await serve({ tier: arg('tier', 'local'), base: arg('base'), token: arg('token') })
}
