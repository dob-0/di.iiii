/**
 * The agent door — what sdk/mcp.mjs serves, without the transport.
 * Spec: docs/architecture/SPEC_agent_door.md.
 *
 * Four tools instead of one per route. An agent loads the catalogue's detail
 * only for what it is about to use (find → describe → call), and chains steps
 * in one tool call (run) instead of paying a model round-trip for each — the
 * pattern in Anthropic's "Code execution with MCP" and "Advanced tool use"
 * (2025-11) and Cloudflare's "Code Mode" (2025-09).
 *
 * Two kinds of entry, one namespace:
 *   moves   'space.list', 'project.writeHtml' … — sdk/moves.js, the shortcuts
 *           that carry the traps; ranked first by find
 *   routes  'get_spaces_projects' … — every route the server's own catalogue
 *           (GET /api/catalogue) opens to agents, read from the live server,
 *           so this door always describes the server it is talking to
 *
 * Nothing here is the protection. The server refuses what the caller's token
 * may not do; the public-move gate below only saves a wasted call and makes
 * the agent say out loud what it is about to open.
 */

import { DiError } from './http.js'
import { MOVES } from './moves.js'
import { PUBLIC, reachOf } from './reach.js'

export const MAX_TEXT = 24000
export const MAX_STEPS = 20

/* ─────────────────────────── the index ─────────────────────────── */

const MOVE_TYPES = { string: 'string', boolean: 'boolean', number: 'number' }

export const moveSchema = (move) => {
    const properties = {}
    const required = []
    for (const [key, spec] of Object.entries(move.input || {})) {
        const optional = typeof spec === 'string' && spec.endsWith('?')
        const bare = typeof spec === 'string' ? spec.replace(/\?$/, '') : 'array'
        properties[key] = MOVE_TYPES[bare] ? { type: MOVE_TYPES[bare] } : { type: 'array', items: { type: 'object' } }
        if (!optional) required.push(key)
    }
    return { type: 'object', properties, required, additionalProperties: false }
}

const moveEntry = ([name, move]) => ({
    kind: 'move',
    name,
    summary: move.summary,
    area: name.split('.')[0],
    reach: typeof move.reach === 'function' ? 'depends on arguments' : move.reach,
    input: moveSchema(move),
    move
})

/** OpenAPI 3.1 (what GET /api/catalogue serves) → route entries. */
export const routeEntries = (doc) => {
    const out = []
    for (const [openPath, methods] of Object.entries(doc?.paths || {})) {
        for (const [method, op] of Object.entries(methods)) {
            const params = op.parameters || []
            const queryParams = params.filter((p) => p.in === 'query')
            out.push({
                kind: 'route',
                name: op.operationId,
                summary: op.summary,
                area: op.tags?.[0] || '',
                note: op.description || null,
                method: method.toUpperCase(),
                path: openPath,
                pathParams: params.filter((p) => p.in === 'path').map((p) => p.name),
                query: queryParams.length
                    ? {
                        type: 'object',
                        properties: Object.fromEntries(queryParams.map((p) => [p.name, p.schema || {}])),
                        required: queryParams.filter((p) => p.required).map((p) => p.name)
                    }
                    : null,
                body: op.requestBody?.content?.['application/json']?.schema || null,
                reach: op['x-di-reach'],
                role: op['x-di-role']
            })
        }
    }
    return out
}

export const buildIndex = (catalogueDoc) => {
    const entries = [...Object.entries(MOVES).map(moveEntry), ...routeEntries(catalogueDoc)]
    return { entries, byName: new Map(entries.map((e) => [e.name, e])) }
}

/* ─────────────────────────── find ─────────────────────────── */

// Plain word overlap, deliberately: the catalogue is a few hundred short
// lines, and a result the agent can predict beats a clever one it cannot.
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))

const scoreOf = (entry, query) => {
    const name = new Set(words(entry.name))
    const summary = new Set(words(entry.summary))
    const rest = new Set(words(`${entry.path || ''} ${entry.area} ${entry.note || ''}`))
    let score = 0
    for (const q of query) {
        if (name.has(q)) score += 3
        else if (summary.has(q)) score += 2
        else if (rest.has(q)) score += 1
    }
    return score > 0 && entry.kind === 'move' ? score + 1 : score
}

const brief = (e) => ({
    name: e.name,
    kind: e.kind,
    ...(e.kind === 'route' ? { route: `${e.method} ${e.path}` } : {}),
    reach: e.reach,
    summary: e.summary
})

export const find = (index, { query = '', limit = 15, cursor = null } = {}) => {
    const q = words(query)
    if (!q.length) {
        // Nothing asked: say what there is, by area, so the next call can ask well.
        const areas = {}
        for (const e of index.entries) areas[e.area] = (areas[e.area] || 0) + 1
        return {
            total: index.entries.length,
            areas,
            moves: index.entries.filter((e) => e.kind === 'move').map(brief),
            hint: 'Ask with words ("list projects in a space", "scene entities"), then di_describe one name.'
        }
    }
    const ranked = index.entries
        .map((e) => ({ e, s: scoreOf(e, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    const start = Math.max(0, Number.parseInt(cursor || '0', 10) || 0)
    const size = Math.min(Math.max(1, Number(limit) || 15), 50)
    const page = ranked.slice(start, start + size).map((x) => brief(x.e))
    return {
        total: ranked.length,
        results: page,
        ...(start + size < ranked.length ? { nextCursor: String(start + size) } : {})
    }
}

/* ─────────────────────────── describe ─────────────────────────── */

export const describe = (index, name) => {
    const e = index.byName.get(name)
    if (!e) throw new DiError(`no such name "${name}" — di_find first; names come from its results`, { code: 'unknown_name' })
    if (e.kind === 'move') {
        return {
            name: e.name,
            kind: 'move',
            summary: e.summary,
            reach: e.reach,
            ...(typeof e.move.opens === 'function' ? { opens: e.move.opens({ space: '<space>', label: '<label>' }) } : {}),
            args: e.input,
            call: { name: e.name, args: Object.fromEntries(Object.keys(e.input.properties).map((k) => [k, `<${k}>`])) }
        }
    }
    return {
        name: e.name,
        kind: 'route',
        route: `${e.method} ${e.path}`,
        summary: e.summary,
        reach: e.reach,
        role: e.role,
        ...(e.note ? { note: e.note } : {}),
        params: e.pathParams,
        ...(e.query ? { query: e.query } : {}),
        ...(e.body ? { body: e.body } : {}),
        call: {
            name: e.name,
            ...(e.pathParams.length ? { params: Object.fromEntries(e.pathParams.map((p) => [p, `<${p}>`])) } : {}),
            ...(e.query ? { query: {} } : {}),
            ...(e.body ? { body: {} } : {})
        }
    }
}

/* ─────────────────────────── the gate ─────────────────────────── */

const reachOfCall = (entry, call) => (entry.kind === 'move' ? reachOf(entry.move, call.args || {}) : entry.reach)

const opensOf = (entry, call) => {
    if (entry.kind === 'move' && typeof entry.move.opens === 'function') return entry.move.opens(call.args || {})
    return `${entry.name} (${entry.summary}) is marked as opening a door`
}

/**
 * Public moves: refused unless the person who LAUNCHED the server allowed them
 * (DI_MCP_ALLOW_PUBLIC=1), and even then only with confirm: true on the call.
 * Returns null to proceed, or the refusal text.
 */
export const gate = ({ entry, call, confirm, allowPublic }) => {
    if (reachOfCall(entry, call) !== PUBLIC) return null
    const opens = opensOf(entry, call)
    if (!allowPublic) {
        return `REFUSED. ${entry.name} opens a door:\n  ${opens}\n\n` +
            'This di.iiii MCP server runs with public moves switched off, which is the default. ' +
            'Nobody can approve it from inside this conversation — the person running the agent has to restart it with DI_MCP_ALLOW_PUBLIC=1.'
    }
    if (confirm !== true) {
        return `NOT DONE. ${entry.name} opens a door:\n  ${opens}\n\n` +
            'Tell the person exactly this and wait for their answer. If they say yes, call again with confirm: true. Do not decide this yourself.'
    }
    return null
}

/* ─────────────────────────── call ─────────────────────────── */

const fillPath = (entry, params = {}) => entry.path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') {
        throw new DiError(`${entry.name} needs params.${key} — di_describe ${entry.name} lists what it takes`, { code: 'missing_param' })
    }
    return encodeURIComponent(String(value))
})

const withQuery = (path, query) => {
    const pairs = Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null)
    if (!pairs.length) return path
    return `${path}?${new URLSearchParams(pairs.map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]))}`
}

/** One call. `di` is what connect() returns. */
export const callOne = async (di, entry, call) => {
    if (entry.kind === 'move') return di.run(entry.name, call.args || {})
    const path = withQuery(fillPath(entry, call.params), call.query)
    const { status, body } = await di.request(entry.method, path, entry.method === 'GET' ? {} : { body: call.body ?? {} })
    return { status, body }
}

/* ─────────────────────────── run ─────────────────────────── */

const lookup = (results, ref) => {
    const [head, ...rest] = ref.split('.')
    if (!(head in results)) throw new DiError(`\${${ref}} names a step that has not run — steps can only use earlier results`, { code: 'bad_reference' })
    return rest.reduce((v, k) => (v == null ? undefined : v[k]), results[head])
}

// "${list.body.projects.0.id}" alone → that value, whatever its type;
// inside a longer string → interpolated as text.
export const resolveRefs = (value, results) => {
    if (typeof value === 'string') {
        const whole = value.match(/^\$\{([^}]+)\}$/)
        if (whole) return lookup(results, whole[1])
        return value.replace(/\$\{([^}]+)\}/g, (_, ref) => String(lookup(results, ref) ?? ''))
    }
    if (Array.isArray(value)) return value.map((v) => resolveRefs(v, results))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, results)]))
    return value
}

/**
 * Several calls in order, one tool call. Stops at the first failure and says
 * exactly which steps ran, which failed, and which never started — a partial
 * run must never read as a finished one.
 */
export const runSteps = async (di, index, { steps = [], confirm = false, allowPublic = false }) => {
    if (!Array.isArray(steps) || !steps.length) throw new DiError('run needs at least one step', { code: 'no_steps' })
    if (steps.length > MAX_STEPS) throw new DiError(`at most ${MAX_STEPS} steps in one run`, { code: 'too_many_steps' })
    const entries = steps.map((s, i) => {
        const e = index.byName.get(s.name)
        if (!e) throw new DiError(`step ${i + 1}: no such name "${s.name}"`, { code: 'unknown_name' })
        return e
    })
    // The gate reads each step as written. A step whose reach depends on
    // arguments that are still references is judged again once resolved.
    for (let i = 0; i < steps.length; i++) {
        const refusal = gate({ entry: entries[i], call: steps[i], confirm, allowPublic })
        if (refusal) return { done: [], refused: { step: i + 1, text: refusal }, notRun: steps.map((s) => s.name) }
    }
    const results = {}
    const done = []
    for (let i = 0; i < steps.length; i++) {
        const key = steps[i].as || `s${i + 1}`
        try {
            const call = resolveRefs({ params: steps[i].params, query: steps[i].query, body: steps[i].body, args: steps[i].args }, results)
            const refusal = gate({ entry: entries[i], call, confirm, allowPublic })
            if (refusal) return { done, refused: { step: i + 1, text: refusal }, notRun: steps.slice(i).map((s) => s.name) }
            results[key] = await callOne(di, entries[i], call)
            done.push({ step: i + 1, name: steps[i].name, as: key })
        } catch (error) {
            return {
                done,
                failed: { step: i + 1, name: steps[i].name, error: `${error.name || 'Error'}: ${error.message}` },
                notRun: steps.slice(i + 1).map((s) => s.name),
                results
            }
        }
    }
    return { done, results }
}

/* ─────────────────────────── shaping results ─────────────────────────── */

// Big answers cost the conversation twice (text and structured). Past the cap
// the agent gets the shape and the size, and is told how to ask for less.
export const shape = (value) => {
    const text = JSON.stringify(value, null, 2) ?? 'null'
    if (text.length <= MAX_TEXT) return { text, structured: value && typeof value === 'object' && !Array.isArray(value) ? value : { value } }
    const keys = value && typeof value === 'object' ? Object.keys(Array.isArray(value) ? {} : value).slice(0, 30) : []
    return {
        text: `${text.slice(0, MAX_TEXT)}\n… TRUNCATED: ${text.length} characters, showing ${MAX_TEXT}. ` +
            'Ask for less: a query filter or limit (di_describe shows which), or one item instead of the list.',
        structured: { truncated: true, characters: text.length, keys }
    }
}
