// A di.iiii install in memory, for the production-versions tests: the routes the tools use, with the
// SERVER's own schema (shared/projectSchema.cjs) applying every op and normalising every document, so a
// component the server would drop is dropped here too. Not a test file (no .test.): imported by them.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const schema = require('../../shared/projectSchema.cjs')

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, body, text: JSON.stringify(body ?? null) })

/**
 * `projects`: { [id]: { space, document, meta?: { state, title, createdAt, visibility } } }.
 * Options: `refuseOps` (n: answer 409 to the next n op writes), `server` (a schema to apply ops with —
 * default the server's). Returns a client (get/post/put/del/bytes) plus `rows` (the state) and `writes`.
 */
export const fakeInstall = (projects = {}, { refuseOps = 0, server = schema } = {}) => {
    const rows = new Map()
    for (const [id, p] of Object.entries(projects)) {
        rows.set(id, { space: p.space || 'moxir', version: 1, document: server.normalizeProjectDocument(p.document || { entities: [] }), meta: { state: 'live', title: id, createdAt: Date.UTC(2026, 8, 30), ...(p.meta || {}) } })
    }
    const writes = []
    let refusals = refuseOps
    const route = (path) => path.split('?')[0].split('/').filter(Boolean)
    const get = async (path) => {
        const r = route(path)
        if (r[1] === 'projects' && r.length === 3) {
            const p = rows.get(r[2])
            return p ? json(200, { project: { id: r[2], spaceId: p.space, ...p.meta } }) : json(404, { error: 'Project not found.' })
        }
        if (r[1] === 'projects' && r[3] === 'document') {
            const p = rows.get(r[2])
            return p ? json(200, { document: structuredClone(p.document), version: p.version }) : json(404, { error: 'Project not found.' })
        }
        if (r[1] === 'spaces' && r[3] === 'projects') {
            return json(200, { projects: [...rows].filter(([, p]) => p.space === r[2]).map(([id, p]) => ({ id, spaceId: p.space, ...p.meta })) })
        }
        return json(404, { error: `no route ${path}` })
    }
    const post = async (path, body) => {
        const r = route(path)
        writes.push({ method: 'POST', path, body })
        if (r[1] === 'projects' && r[3] === 'ops') {
            const p = rows.get(r[2])
            if (!p) return json(404, { error: 'Project not found.' })
            if (refusals > 0) { refusals -= 1; p.version += 1; return json(409, { error: 'out of date', latestVersion: p.version }) }
            if (body.baseVersion !== p.version) return json(409, { error: 'out of date', latestVersion: p.version })
            p.document = server.applyProjectOps(p.document, body.ops)
            p.version += 1
            return json(200, { newVersion: p.version })
        }
        if (r[1] === 'spaces' && r[3] === 'projects') {
            const id = body.slug
            if (rows.has(id)) return json(409, { error: 'taken' })
            rows.set(id, { space: r[2], version: 0, document: server.normalizeProjectDocument({ entities: [] }), meta: { state: 'live', title: body.title, createdAt: Date.now(), ...(body.visibility ? { visibility: body.visibility } : {}) } })
            return json(201, { project: { id } })
        }
        return json(404, { error: `no route ${path}` })
    }
    const del = async (path) => {
        const r = route(path)
        writes.push({ method: 'DELETE', path })
        return rows.delete(r[2]) ? json(200, { ok: true }) : json(404, {})
    }
    const put = async (path) => { writes.push({ method: 'PUT', path }); return json(405, {}) }
    return { get, post, del, put, bytes: async () => ({ ok: false, status: 404 }), rows, writes }
}

/** A project document carrying a version mark (the rigVariant load-version / copy-version write). */
export const markedDoc = (mark, extra = []) => ({
    entities: [
        { id: 'hall-floor', type: 'box', name: 'floor', components: {} },
        ...extra,
        ...(mark ? [{ id: 'rig-show', type: 'group', name: 'the show', components: { rigVariant: { siblings: [{ id: mark.id, projectId: 'x' }], ...mark } } }] : [])
    ]
})
