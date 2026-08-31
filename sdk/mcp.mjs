#!/usr/bin/env node
/**
 * di.iiii as tools an agent can call — the same moves as sdk/index.js, spoken
 * over MCP so Claude reaches them the way it reaches anything else.
 *
 *   claude mcp add di -- node /path/to/di.iiii/sdk/mcp.mjs --tier local
 *
 * JSON-RPC by hand, with no dependency, on purpose: this ships inside a 3.1 MB
 * offline artifact meant to work at a venue with no network, and the protocol
 * that matters here is three methods long.
 *
 * ── the safety story, plainly ──
 * Read and private moves just run. Public moves — the ones that open a door to
 * someone new — are REFUSED outright unless the person running the agent
 * turned them on with DI_MCP_ALLOW_PUBLIC=1, and even then each call must
 * carry confirm: true and says in the refusal exactly who would be able to see
 * what. An agent left running unattended cannot publish, cannot mint an access
 * link and cannot delete a space, because the default is not "ask" — it is no.
 */

import { readFileSync } from 'node:fs'
import { connect } from './index.js'
import { MOVES } from './moves.js'
import { PUBLIC, reachOf } from './reach.js'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}

const VERSION = (() => {
    try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version } catch { return '0.0.0' }
})()

// MCP tool names are conservative about punctuation; the dots stay in the SDK
// where they read better and become underscores on the wire.
export const toolName = (move) => move.replace(/\./g, '_')
export const moveName = (tool) => {
    const direct = tool.replace(/_/g, '.')
    return MOVES[direct] ? direct : Object.keys(MOVES).find((m) => toolName(m) === tool) || direct
}

const TYPES = { string: 'string', boolean: 'boolean', number: 'number' }

export const inputSchema = (move) => {
    const properties = {}
    const required = []
    for (const [key, spec] of Object.entries(move.input || {})) {
        const optional = typeof spec === 'string' && spec.endsWith('?')
        const bare = typeof spec === 'string' ? spec.replace(/\?$/, '') : 'array'
        properties[key] = TYPES[bare] ? { type: TYPES[bare] } : { type: 'array', items: { type: 'object' } }
        if (!optional) required.push(key)
    }
    if (reachOf(move, {}) === PUBLIC || typeof move.reach === 'function') {
        properties.confirm = {
            type: 'boolean',
            description: 'Required for anything that opens a door. Only true if the person you are working for has said so IN THIS CONVERSATION.'
        }
    }
    return { type: 'object', properties, required, additionalProperties: false }
}

export const describeTools = () => Object.entries(MOVES).map(([name, move]) => {
    const staticReach = typeof move.reach === 'function' ? 'depends on arguments' : move.reach
    const opensLine = typeof move.opens === 'function' ? `\nOPENS A DOOR: ${move.opens({ space: '<space>', label: '<name>' })}` : ''
    return {
        name: toolName(name),
        description: `${move.summary}\nreach: ${staticReach}${opensLine}`,
        inputSchema: inputSchema(move),
        annotations: {
            title: name,
            readOnlyHint: move.reach === 'read',
            destructiveHint: name === 'space.delete',
            openWorldHint: true
        }
    }
})

const allowPublic = () => process.env.DI_MCP_ALLOW_PUBLIC === '1'

const refusalText = (move, args) => {
    const opens = typeof move.opens === 'function' ? move.opens(args) : 'this would be visible to someone new'
    return allowPublic()
        ? `NOT DONE. ${move.name} opens a door:\n  ${opens}\n\n` +
          `Tell the person exactly this and wait for their answer. If they say yes, call again with confirm: true. Do not decide this yourself.`
        : `REFUSED. ${move.name} opens a door:\n  ${opens}\n\n` +
          `This di.iiii MCP server is running with public moves switched off, which is the default. ` +
          `Nobody can approve it from inside this conversation — the person running the agent has to restart it with DI_MCP_ALLOW_PUBLIC=1.`
}

export const createHandler = async ({ tier, base, token, env = process.env, connectImpl = connect } = {}) => {
    let di = null
    const client = async () => (di ||= await connectImpl({
        tier, base, token, env,
        // The MCP layer decides about public moves before the SDK is ever
        // asked, so by the time a call reaches here it has been approved.
        confirm: async () => true
    }))

    return async (request) => {
        const { id, method, params } = request
        const ok = (result) => ({ jsonrpc: '2.0', id, result })
        const text = (t, isError = false) => ok({ content: [{ type: 'text', text: t }], isError })

        if (method === 'initialize') {
            return ok({
                protocolVersion: params?.protocolVersion || '2025-06-18',
                capabilities: { tools: {} },
                serverInfo: { name: 'di.iiii', version: VERSION },
                instructions:
                    'Moves against a di.iiii server. Reading is free. Anything that opens a door — making a space public, ' +
                    'minting an invite link, deleting a space — must be put to the person in words before you call it.'
            })
        }
        if (method === 'tools/list') return ok({ tools: describeTools() })
        if (method === 'tools/call') {
            const name = moveName(params?.name || '')
            const move = MOVES[name]
            if (!move) return text(`no such tool: ${params?.name}`, true)
            const { confirm, ...args } = params?.arguments || {}
            if (reachOf(move, args) === PUBLIC && (!allowPublic() || confirm !== true)) {
                return text(refusalText(move, args), true)
            }
            try {
                const result = await (await client()).run(name, args)
                return text(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
            } catch (error) {
                return text(`${error.name || 'Error'}: ${error.message}`, true)
            }
        }
        if (method === 'ping') return ok({})
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method: ${method}` } }
    }
}

/** Line-delimited JSON-RPC on stdin/stdout, which is all MCP over stdio is. */
export const serve = async ({ input = process.stdin, output = process.stdout, ...options } = {}) => {
    const handle = await createHandler(options)
    let buffer = ''
    input.setEncoding('utf8')
    for await (const chunk of input) {
        buffer += chunk
        let cut
        while ((cut = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, cut).trim()
            buffer = buffer.slice(cut + 1)
            if (!line) continue
            let request
            try { request = JSON.parse(line) } catch { continue }
            const response = await handle(request)
            // A notification has no id and must get no answer at all — replying
            // to one is how a stdio server ends up talking over its client.
            if (request.id === undefined || request.id === null) continue
            output.write(JSON.stringify(response) + '\n')
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await serve({ tier: arg('tier', 'local'), base: arg('base'), token: arg('token') })
}
