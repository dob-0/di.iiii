/**
 * `di show-ready SPACE [PROJECT]` — proves, on THIS machine, that a show has
 * everything it needs: here on disk, in the cloud, and runnable with no internet.
 *
 * Why: on 2026-11-12 one machine was switched off and the others could not get
 * the work, because some scenes lived only on it (ledger N4283, N4288). The rule
 * is two copies that agree: the cloud (dev.diiii.xyz, private + public parts)
 * and a full local copy on every show machine.
 *
 * What it reads (the same files `di save` / space-bundle.mjs export reads — the
 * space's database rows and spaces/<id>/ on disk):
 *   projects   di.db `projects` (id, title, visibility), deleted ones left out
 *   documents  spaces/<id>/projects/<pid>/document.json
 *   assets     spaces/<id>/projects/<pid>/assets/<hash>[.json] (legacy bytes or a
 *              reference) and spaces/<id>/blobs/<hash> (the shared store)
 * An asset is "needed" when the project's assets folder holds it or its document
 * names it (assetId / asset / assetRef, or a /assets/<hash> address).
 *
 * Checks: LOCAL (bytes present, sha256 equals the id, size equals the reference),
 * CLOUD (space, project, same visibility, same assets — the host is asked with the
 * stored login; the token is read from the file and never printed), OFFLINE (any
 * http(s) address outside this machine and the host: a show that needs internet).
 *
 * Exit: 0 nothing missing · 1 a problem · 2 the host could not be asked.
 * Nothing is written anywhere; no file contents and no token are ever printed.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { withUserAgent } from './userAgent.mjs'

export const EXIT_OK = 0
export const EXIT_PROBLEM = 1
export const EXIT_HOST_UNREACHABLE = 2

const HASH = /^[a-f0-9]{64}$/
const ASSET_URL = /\/api\/projects\/([^/\s"'?#]+)\/assets\/([a-f0-9]{64})/g
const ASSET_KEYS = /^(assetId|asset|assetRef|[A-Za-z]*AssetId)$/
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)\\]+/g
// XML namespace names are identifiers, not fetches.
const NAMESPACE_HOSTS = new Set(['www.w3.org', 'purl.org', 'schemas.xmlsoap.org'])

export const isLocalHost = (hostname) => {
    const h = String(hostname || '').toLowerCase()
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h.endsWith('.localhost')
}

const readJson = async (file) => { try { return JSON.parse(await fsp.readFile(file, 'utf8')) } catch { return null } }

// ── LOCAL ─────────────────────────────────────────────────────────────────

/** Projects of a space from this machine's database, read-only. null = no such space here. */
export const listLocalProjects = async (dataDir, space) => {
    const dbPath = path.join(dataDir, 'di.db')
    if (!fs.existsSync(dbPath)) return { error: `no database at ${dbPath}` }
    const { DatabaseSync } = await import('node:sqlite')
    let db
    try { db = new DatabaseSync(dbPath, { readOnly: true }) } catch { db = new DatabaseSync(dbPath) }
    try {
        if (!db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(space)) return { projects: null }
        const rows = db.prepare('SELECT id, title, visibility FROM projects WHERE space_id = ? AND deleted_at IS NULL ORDER BY created_at ASC').all(space)
        return { projects: rows.map((r) => ({ id: r.id, title: r.title, visibility: r.visibility || 'public' })) }
    } finally { db.close() }
}

const walkStrings = (value, visit, key = '') => {
    if (typeof value === 'string') visit(value, key)
    else if (Array.isArray(value)) for (const item of value) walkStrings(item, visit, key)
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walkStrings(v, visit, k)
}

/** What a document names: needed assets [{project, id}] and outside addresses [host]. */
export const readDocument = (doc, projectId) => {
    const assets = new Map()
    const hosts = new Set()
    const add = (project, id) => assets.set(`${project}/${id}`, { project, id })
    walkStrings(doc, (text, key) => {
        if (ASSET_KEYS.test(key) && HASH.test(text)) add(projectId, text)
        for (const m of text.matchAll(ASSET_URL)) add(m[1], m[2])
        for (const m of text.match(URL_IN_TEXT) || []) {
            try { hosts.add(new URL(m).hostname.toLowerCase()) } catch { /* not an address */ }
        }
    })
    return { assets: [...assets.values()], hosts: [...hosts] }
}

const sha256File = (file) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
})

/** One asset on disk: { state: 'ok'|'missing'|'badhash'|'badsize', size }. */
export const checkLocalAsset = async (spaceDir, project, id) => {
    const assetsDir = path.join(spaceDir, 'projects', project, 'assets')
    const meta = await readJson(path.join(assetsDir, `${id}.json`))
    let file = null
    for (const candidate of [path.join(assetsDir, id), path.join(spaceDir, 'blobs', id)]) {
        try { if ((await fsp.stat(candidate)).isFile()) { file = candidate; break } } catch { /* next */ }
    }
    if (!file) return { state: 'missing' }
    const size = (await fsp.stat(file)).size
    if (typeof meta?.size === 'number' && meta.size !== size) return { state: 'badsize', size }
    if (HASH.test(id) && (await sha256File(file)) !== id) return { state: 'badhash', size }
    return { state: 'ok', size }
}

/** Everything this machine holds for one project. */
export const gatherLocalProject = async (dataDir, space, project) => {
    const spaceDir = path.join(dataDir, 'spaces', space)
    const docFile = path.join(spaceDir, 'projects', project.id, 'document.json')
    const doc = await readJson(docFile)
    if (!doc) return { documentOk: false, assets: [], hosts: [] }
    const named = readDocument(doc, project.id)
    const wanted = new Map(named.assets.map((a) => [`${a.project}/${a.id}`, a]))
    const assetsDir = path.join(spaceDir, 'projects', project.id, 'assets')
    let names = []
    try { names = await fsp.readdir(assetsDir) } catch { /* no folder: nothing held */ }
    for (const name of names) {
        const id = name.replace(/\.json$/, '')
        if (HASH.test(id)) wanted.set(`${project.id}/${id}`, { project: project.id, id })
    }
    const assets = []
    for (const a of wanted.values()) assets.push({ ...a, ...(await checkLocalAsset(spaceDir, a.project, a.id)) })
    return { documentOk: true, assets, hosts: named.hosts }
}

// ── CLOUD ─────────────────────────────────────────────────────────────────

/** Asks the host with the stored login. Never throws; { down } = could not be reached. */
const hostGet = async (fetchImpl, host, token, pathname, timeoutMs) => {
    try {
        const res = await fetchImpl(`${host}/serverXR${pathname}`, {
            headers: withUserAgent({ accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }),
            signal: AbortSignal.timeout(timeoutMs)
        })
        const body = await res.json().catch(() => null)
        return { status: res.status, body }
    } catch (error) {
        return { down: true, why: String(error?.cause?.code || error?.code || error?.name || 'no answer') }
    }
}

const inPool = async (items, limit, work) => {
    const out = new Array(items.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) { const i = next++; out[i] = await work(items[i]) }
    }))
    return out
}

// ── the whole check ───────────────────────────────────────────────────────

/**
 * Returns { exit, problems: {onlyHere, onlyCloud, different, needsInternet, notChecked}, ok: {…}, lines }.
 * Pure of the process: dataDir, host, token and fetchImpl are all given.
 */
export const checkShowReady = async ({ dataDir, space, project = null, host, token, fetchImpl = fetch, timeoutMs = 15000 }) => {
    const r = { space, host, onlyHere: [], onlyCloud: [], different: [], needsInternet: [], notChecked: [], ok: { projects: 0, assets: 0 }, unreachable: null, fatal: null }
    const local = await listLocalProjects(dataDir, space)
    if (local.error) { r.fatal = local.error; return finish(r) }
    if (local.projects === null) { r.fatal = `space "${space}" is not on this machine`; return finish(r) }
    let projects = local.projects
    if (project) {
        projects = projects.filter((p) => p.id === project || p.title === project)
        if (!projects.length) { r.fatal = `project "${project}" is not in space "${space}" on this machine`; return finish(r) }
    }

    // LOCAL + OFFLINE
    const localById = new Map()
    for (const p of projects) {
        const g = await gatherLocalProject(dataDir, space, p)
        localById.set(p.id, g)
        const label = `${space}/${p.id}`
        if (!g.documentOk) r.different.push(`${label}: the project document is missing or cannot be read on this machine`)
        for (const a of g.assets) {
            if (a.state === 'missing') r.different.push(`${label}: asset ${a.id.slice(0, 12)} is named by the project but its bytes are not on this machine`)
            else if (a.state === 'badhash') r.different.push(`${label}: asset ${a.id.slice(0, 12)} on this machine is damaged (its hash does not match)`)
            else if (a.state === 'badsize') r.different.push(`${label}: asset ${a.id.slice(0, 12)} on this machine has the wrong size`)
        }
        const hostName = (() => { try { return new URL(host).hostname.toLowerCase() } catch { return '' } })()
        const outside = g.hosts.filter((h) => !isLocalHost(h) && h !== hostName && !NAMESPACE_HOSTS.has(h))
        for (const h of outside) r.needsInternet.push(`${label}: reaches ${h} (needs internet)`)
    }

    // CLOUD
    // `token` may be several (the space's follow key first, then the login): the first the host accepts is used.
    const tokens = [].concat(token || []).filter(Boolean)
    const listPath = `/api/spaces/${encodeURIComponent(space)}/projects`
    const refused = (x) => x.status === 401 || x.status === 403
    let useToken = tokens[0] || ''
    let listing = await hostGet(fetchImpl, host, useToken, listPath, timeoutMs)
    for (let i = 1; i < tokens.length && !listing.down && refused(listing); i += 1) {
        useToken = tokens[i]
        listing = await hostGet(fetchImpl, host, useToken, listPath, timeoutMs)
    }
    if (listing.down) { r.unreachable = `${host} did not answer (${listing.why})`; return finish(r) }
    if (!tokens.length) { r.unreachable = `not signed in to ${host}: run di login first, then again`; return finish(r) }
    // 403 "Space access denied" (it names requiredSpaceId): the cloud knows no such space for this login.
    const spaceDenied = listing.status === 403 && Boolean(listing.body?.requiredSpaceId)
    if (listing.status === 401 || (listing.status === 403 && !spaceDenied)) { r.unreachable = `${host} did not accept the stored login (HTTP ${listing.status}): run di login`; return finish(r) }
    if (listing.status >= 500) { r.unreachable = `${host} answered HTTP ${listing.status}`; return finish(r) }
    const cloudProjects = listing.status === 200 ? (listing.body?.projects || []) : null
    if (listing.status === 404 || spaceDenied || cloudProjects === null) {
        const why = spaceDenied ? 'the cloud gives this login no access to the space, so it is not there for you' : 'the space is not in the cloud'
        for (const p of projects) r.onlyHere.push(`${space}/${p.id} (${p.visibility}): only on this machine, ${why}`)
        return finish(r)
    }
    const cloudById = new Map(cloudProjects.map((p) => [p.id, p]))
    for (const p of projects) {
        const label = `${space}/${p.id}`
        const c = cloudById.get(p.id)
        if (!c) { r.onlyHere.push(`${label} (${p.visibility}): only on this machine, not in the cloud`); continue }
        if ((c.visibility || 'public') !== p.visibility) {
            r.different.push(`${label}: ${p.visibility} here but ${c.visibility || 'public'} in the cloud`)
            continue
        }
        r.ok.projects += 1
        const g = localById.get(p.id)
        const results = await inPool(g.assets.filter((a) => a.state === 'ok'), 8, async (a) => {
            const res = await hostGet(fetchImpl, host, useToken, `/api/projects/${encodeURIComponent(a.project)}/assets/${a.id}/meta`, timeoutMs)
            return { a, res }
        })
        for (const { a, res } of results) {
            if (res.down) { r.unreachable = `${host} stopped answering while checking assets (${res.why})`; return finish(r) }
            if (res.status === 404) r.onlyHere.push(`${label}: asset ${a.id.slice(0, 12)} is only on this machine, not in the cloud`)
            else if (res.status !== 200) r.notChecked.push(`${label}: asset ${a.id.slice(0, 12)} could not be checked (HTTP ${res.status})`)
            else if (typeof res.body?.asset?.size === 'number' && res.body.asset.size !== a.size) r.different.push(`${label}: asset ${a.id.slice(0, 12)} differs in size (here ${a.size}, cloud ${res.body.asset.size})`)
            else r.ok.assets += 1
        }
    }
    const wanted = new Set(projects.map((p) => p.id))
    if (!project) for (const c of cloudProjects) if (!localById.has(c.id) && !wanted.has(c.id)) r.onlyCloud.push(`${space}/${c.id} (${c.visibility || 'public'}): in the cloud, not on this machine`)
    return finish(r)
}

const finish = (r) => {
    const problems = r.onlyHere.length + r.onlyCloud.length + r.different.length + r.needsInternet.length + r.notChecked.length
    r.exit = r.unreachable ? EXIT_HOST_UNREACHABLE : (r.fatal || problems ? EXIT_PROBLEM : EXIT_OK)
    return r
}

/** Plain words, one line per problem, grouped. */
export const renderReport = (r) => {
    const out = []
    if (r.fatal) out.push(`NOT READY: ${r.fatal}`)
    const group = (title, lines) => { if (lines.length) out.push('', `${title} (${lines.length})`, ...lines.map((l) => `  ${l}`)) }
    group('ONLY HERE (not in the cloud: lost if this machine is lost)', r.onlyHere)
    group('ONLY CLOUD (not on this machine: will not run without internet)', r.onlyCloud)
    group('DIFFERENT', r.different)
    group('NEEDS INTERNET', r.needsInternet)
    group('NOT CHECKED', r.notChecked)
    if (r.unreachable) out.push('', `CLOUD NOT REACHED: ${r.unreachable}`)
    out.push('', `OK: ${r.ok.projects} project(s), ${r.ok.assets} asset(s) the same here and in the cloud`)
    const verdict = r.exit === EXIT_OK ? `READY: ${r.space} is complete here, complete in the cloud, and needs no internet.`
        : r.exit === EXIT_HOST_UNREACHABLE ? `UNKNOWN: ${r.space} could not be compared with the cloud (exit 2).`
            : `NOT READY: ${r.space} has problems (exit 1).`
    out.push(verdict)
    return out.join('\n').replace(/^\n/, '')
}

export const jsonReport = (r) => JSON.stringify({
    space: r.space, host: r.host, exit: r.exit, ready: r.exit === 0, fatal: r.fatal, unreachable: r.unreachable,
    onlyHere: r.onlyHere, onlyCloud: r.onlyCloud, different: r.different, needsInternet: r.needsInternet, notChecked: r.notChecked, ok: r.ok
}, null, 2)

export const showReadyUsage = (cmd = 'di') => [
    `${cmd} show-ready SPACE [PROJECT] [--host URL] [--json]`,
    '',
    'Proves that a show is complete on THIS machine and in the cloud, and needs no internet.',
    'Reads only; changes nothing; prints no token and no file contents.',
    '',
    '  SPACE        the space the show lives in (e.g. hayfilm)',
    '  PROJECT      one project (its id or title); default: every project of the space',
    '  --host URL   the cloud to compare with (default: the dev hub, https://dev.diiii.xyz)',
    '  --json       the same result as JSON, for a script',
    '',
    'Uses the login `di login` stored. Groups: ONLY HERE · ONLY CLOUD · DIFFERENT · NEEDS INTERNET · OK.',
    'Exit 0 nothing missing · 1 a problem · 2 the cloud could not be reached (or no login).'
].join('\n')
