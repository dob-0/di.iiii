#!/usr/bin/env node
/**
 * assets-reid.mjs — give a project's older files a name `di follow` can carry.
 *
 * `di follow` carries a file only when its id is the sha256 of its bytes (`isCarriableId` in
 * serverXR/src/follow/assets.js: /^[a-f0-9]{64}$/i). Files added before files had checkable names
 * hold a legacy uuid-style id; follow counts them as "older files are not carried … add them again"
 * (`followFileLines`, scripts/di/ui.mjs; docs/architecture/SPEC_follow_files.md). Adding them again
 * is what this does, once per file and in order:
 *
 *   1. download the bytes from the install (GET /api/projects/:id/assets/:assetId);
 *   2. upload them through the ordinary route (POST /api/projects/:id/assets). The route content-
 *      addresses them — and re-encodes images (EXIF/GPS scrub), so the new id may differ from the
 *      bytes' own sha256: the id the server RETURNS is the one used (scripts/asset-remap-lib.mjs
 *      says why);
 *   3. rewrite every reference to the old id in the project's document — entity components, nodes,
 *      edges, the world/render/xr/presentation/publish/show states, perform presets, mapping
 *      surfaces and cues, project meta, and URLs inside presentation code — to the new id, as OPS
 *      (upsertAsset, updateComponent, updateEntity, updateNode, updateEdge, set*State,
 *      upsertPerformPreset, setMappingSurface/Cue/State, setProjectMeta), never a whole-document
 *      PUT: follow does not carry those. Written at the version just re-read; a 409 re-reads and
 *      re-plans;
 *   4. read back. Only when the new entry reads back and NO reference to the old id is left, the
 *      old entry is dropped (deleteAsset). The old bytes stay in the store.
 *
 * A project whose old id is referenced from a place that cannot be rewritten safely is REFUSED
 * whole (nothing uploaded, nothing written) and said so: an id used as an object KEY, an id inside
 * windowLayout / workspaceState / templates, a short id embedded in free text, or an id that sits
 * inside an entity/node/edge id.
 *
 *   node scripts/assets-reid.mjs --space open --api https://local.thedi.studio/serverXR \
 *       --token-file ~/.di/di.env --dry-run
 *   node scripts/assets-reid.mjs --space open … [--project <id>] [--undo-dir <dir>]
 *   node scripts/assets-reid.mjs --undo <undo-file> --api … --token-file …
 *
 * Every real run writes an undo record (default ~/di-backups/assets-reid/) BEFORE its first write;
 * --undo puts the old entries back, points the references at the old ids again and drops the new
 * entries (old bytes were never deleted, so the old ids still resolve).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import { parseArgs, die, say } from './place/common.mjs'
import { makeClient, readToken } from './place/api.mjs'
import { isMainModule } from './lib/isMainModule.mjs'

const require = createRequire(import.meta.url)
// one definition of "checkable name": the one follow uses
const { isCarriableId } = require('../serverXR/src/follow/assets.js')

/** The project whose store holds an asset's bytes: the one its url names, else `fallback`. Pure. */
export const sourceProjectOf = (asset, fallback) => {
    const m = /\/api\/projects\/([^/]+)\/assets\//.exec(String(asset?.url || ''))
    return m ? decodeURIComponent(m[1]) : fallback
}

export const KNOWN_FLAGS = ['space', 'api', 'token-file', 'project', 'dry-run', 'undo', 'undo-dir', 'max-bytes', 'verbose']
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024
const CHUNK = 100
const SHORT_ID = 16

export const legacyAssets = (document) => (Array.isArray(document?.assets) ? document.assets : []).filter((a) => a?.id && !isCarriableId(a.id))

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ID_CHAR = 'A-Za-z0-9_-'
const buildRe = (ids) => new RegExp(`(?<![${ID_CHAR}])(${[...ids].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![${ID_CHAR}])`, 'g')

// sections of the document an op can reach; assets and entities are handled apart
const SECTION_OPS = new Set(['projectMeta', 'worldState', 'renderSettings', 'xrState', 'presentationState', 'publishState', 'showState', 'performState', 'mappingState', 'nodes', 'edges', 'entities', 'assets'])

/**
 * Every place a document names one of `ids`.
 * Returns { counts: {id: n}, sections: {id: [section…]}, unsafe: [reason…] }. Pure.
 */
export const findRefs = (document, ids) => {
    const counts = Object.fromEntries([...ids].map((id) => [id, 0]))
    const sections = Object.fromEntries([...ids].map((id) => [id, new Set()]))
    const unsafe = []
    if (!ids.size) return { counts, sections: {}, unsafe }
    const re = buildRe(ids)
    const note = (id, where) => { counts[id] += 1; sections[id].add(where) }
    const walk = (value, where, section) => {
        if (typeof value === 'string') {
            re.lastIndex = 0
            for (const m of value.matchAll(re)) {
                const id = m[1]
                note(id, section)
                if (!SECTION_OPS.has(section)) unsafe.push(`${id} is named inside ${section}, which no op reaches (${where})`)
                const whole = value === id
                const url = value.slice(Math.max(0, m.index - 8), m.index) === '/assets/'
                if (!whole && !url && id.length < SHORT_ID) unsafe.push(`short id ${id} sits inside free text at ${where}`)
            }
            return
        }
        if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${where}[${i}]`, section)); return }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                re.lastIndex = 0
                if (re.test(k)) unsafe.push(`an id is used as an object key at ${where}.${k}`)
                walk(v, `${where}.${k}`, section)
            }
        }
    }
    for (const [key, value] of Object.entries(document || {})) walk(value, key, key)
    // entity / node / edge ids must never be what changes
    for (const [list, label] of [['entities', 'entity'], ['nodes', 'node'], ['edges', 'edge']]) {
        for (const item of Array.isArray(document?.[list]) ? document[list] : []) {
            re.lastIndex = 0
            if (typeof item?.id === 'string' && re.test(item.id)) unsafe.push(`an old id sits inside the ${label} id ${item.id}`)
        }
    }
    return { counts, sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, [...v]])), unsafe: [...new Set(unsafe)] }
}

/** The document with every old id replaced by its new one (strings only; keys are refused by findRefs). Pure. */
export const rewriteIds = (value, map) => {
    const ids = Object.keys(map)
    if (!ids.length) return value
    const re = buildRe(new Set(ids))
    const walk = (v) => {
        if (typeof v === 'string') { re.lastIndex = 0; return v.replace(re, (m) => map[m] ?? m) }
        if (Array.isArray(v)) return v.map(walk)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        return v
    }
    return walk(value)
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const changedKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => !same(a?.[k], b?.[k]))
const patchOf = (b, keys) => Object.fromEntries(keys.map((k) => [k, b[k]]))

/**
 * The ops that turn `before` into `after`, where `after` is `before` with ids rewritten (so the
 * shapes are equal and only strings differ), plus the asset ops. Returns { ops, refused: [reason] }.
 * `add` are asset entries to upsert; `drop` are ids to delete — kept apart so the caller can send the
 * deletes only after the read-back. Pure.
 */
export const planRewriteOps = (before, after) => {
    const ops = []
    const refused = []
    const SET_OP = { projectMeta: 'setProjectMeta', worldState: 'setWorldState', renderSettings: 'setRenderSettings', xrState: 'setXrState', presentationState: 'setPresentationState', publishState: 'setPublishState', showState: 'setShowState' }
    for (const key of Object.keys(before)) {
        if (key === 'assets' || same(before[key], after[key])) continue
        if (SET_OP[key]) { ops.push({ type: SET_OP[key], payload: { patch: patchOf(after[key], changedKeys(before[key], after[key])) } }); continue }
        if (key === 'entities') {
            before.entities.forEach((e, i) => {
                const n = after.entities[i]
                if (same(e, n)) return
                for (const k of changedKeys(e, n)) {
                    if (k === 'components') {
                        for (const c of changedKeys(e.components, n.components)) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: c, patch: n.components[c] } })
                    } else ops.push({ type: 'updateEntity', payload: { entityId: e.id, patch: { [k]: n[k] } } })
                }
            })
            continue
        }
        if (key === 'nodes') {
            before.nodes.forEach((e, i) => {
                const n = after.nodes[i]
                if (same(e, n)) return
                const keys = changedKeys(e, n)
                const odd = keys.filter((k) => !['label', 'values', 'assetRef'].includes(k))
                if (odd.length) { refused.push(`node ${e.id}: ${odd.join(', ')} names an old id, and updateNode cannot write it`); return }
                ops.push({ type: 'updateNode', payload: { nodeId: e.id, patch: patchOf(n, keys) } })
            })
            continue
        }
        if (key === 'edges') {
            before.edges.forEach((e, i) => { if (!same(e, after.edges[i])) ops.push({ type: 'updateEdge', payload: { edgeId: e.id, patch: patchOf(after.edges[i], changedKeys(e, after.edges[i])) } }) })
            continue
        }
        if (key === 'performState') {
            before.performState.presets.forEach((p, i) => { if (!same(p, after.performState.presets[i])) ops.push({ type: 'upsertPerformPreset', payload: { preset: after.performState.presets[i] } }) })
            const rest = changedKeys({ ...before.performState, presets: 0 }, { ...after.performState, presets: 0 })
            if (rest.length) refused.push(`performState: ${rest.join(', ')} names an old id, and no op writes it`)
            continue
        }
        if (key === 'mappingState') {
            const b = before.mappingState
            const a = after.mappingState
            b.surfaces.forEach((s, i) => { if (!same(s, a.surfaces[i])) ops.push({ type: 'setMappingSurface', payload: { surfaceId: s.id, patch: patchOf(a.surfaces[i], changedKeys(s, a.surfaces[i])) } }) })
            b.cues.forEach((c, i) => {
                if (same(c, a.cues[i])) return
                const keys = changedKeys(c, a.cues[i])
                ops.push({ type: 'setMappingCue', payload: { cueId: c.id, patch: patchOf(a.cues[i], keys) } })
            })
            const rest = changedKeys({ ...b, surfaces: 0, cues: 0 }, { ...a, surfaces: 0, cues: 0 })
            if (rest.length) ops.push({ type: 'setMappingState', payload: { patch: patchOf(a, rest) } })
            continue
        }
        refused.push(`${key} names an old id, and no op writes it`)
    }
    return { ops, refused }
}

const idsOfEntries = (list) => new Set(list.map((a) => a.id))

/**
 * One project, one mapping old→new. Re-reads, plans against what it read, writes in chunks at the
 * version it holds, retries on a 409. `entryFor(oldId, oldEntry)` is the asset entry that goes under
 * the new id. Returns { version, wrote }. Throws on any failure; never half-silent.
 */
export const applyMapping = async (client, projectId, map, entryFor, { log = () => {}, stamp = Date.now() } = {}) => {
    const oldIds = Object.keys(map)
    let seq = 0
    const post = async (version, ops) => {
        const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: version, ops: ops.map((op) => ({ ...op, opId: `assets-reid-${stamp}-${seq++}`, clientId: 'assets-reid' })) })
        if (out.status === 409) return { conflict: true }
        if (!out.ok) throw new Error(`${projectId}: ops route answered ${out.status} ${String(out.text || '').slice(0, 200)}`)
        return { version: out.body?.newVersion }
    }
    const read = async () => {
        const got = await client.get(`/api/projects/${projectId}/document`)
        if (!got.ok) throw new Error(`${projectId}: reading the document: ${got.status}`)
        return { version: Number(got.body?.version) || 0, document: got.body.document }
    }
    let wrote = 0
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const { version, document } = await read()
        const newEntries = []
        for (const id of oldIds) {
            const entry = entryFor(id, document.assets.find((a) => a.id === id))
            if (entry && !document.assets.some((a) => a.id === entry.id) && !newEntries.some((e) => e.id === entry.id)) newEntries.push(entry)
        }
        const rewritten = rewriteIds({ ...document, assets: document.assets.filter((a) => !oldIds.includes(a.id)) }, map)
        const plan = planRewriteOps({ ...document, assets: [] }, { ...rewritten, assets: [] })
        if (plan.refused.length) throw new Error(`${projectId}: cannot rewrite safely: ${plan.refused.join('; ')}`)
        const adds = newEntries.map((entry) => ({ type: 'upsertAsset', payload: { asset: entry } }))
        const all = [...adds, ...plan.ops]
        if (all.length) {
            let v = version
            let conflict = false
            for (let i = 0; i < all.length; i += CHUNK) {
                const r = await post(v, all.slice(i, i + CHUNK))
                if (r.conflict) { conflict = true; break }
                v = r.version
                wrote += Math.min(CHUNK, all.length - i)
            }
            if (conflict) { log(`  ${projectId}: changed while writing — re-reading and planning again`); continue }
        }
        // read back, and only then drop the old entries
        const back = await read()
        const left = findRefs({ ...back.document, assets: back.document.assets.filter((a) => !oldIds.includes(a.id)) }, new Set(oldIds))
        const refs = oldIds.reduce((n, id) => n + left.counts[id], 0)
        if (refs) throw new Error(`${projectId}: read back, ${refs} reference(s) to an old id are still there — old entries NOT dropped`)
        const missing = Object.values(map).filter((id) => !back.document.assets.some((a) => a.id === id))
        if (missing.length) throw new Error(`${projectId}: read back, ${missing.length} new entr${missing.length === 1 ? 'y is' : 'ies are'} missing — old entries NOT dropped`)
        const toDrop = oldIds.filter((id) => back.document.assets.some((a) => a.id === id))
        if (toDrop.length) {
            const r = await post(back.version, toDrop.map((assetId) => ({ type: 'deleteAsset', payload: { assetId } })))
            if (r.conflict) { log(`  ${projectId}: changed before the old entries were dropped — again`); continue }
            wrote += toDrop.length
        }
        const final = await read()
        const stale = oldIds.filter((id) => final.document.assets.some((a) => a.id === id))
        const finalRefs = oldIds.reduce((n, id) => n + findRefs(final.document, new Set([id])).counts[id], 0)
        if (stale.length || finalRefs) throw new Error(`${projectId}: after dropping, ${stale.length} old entries and ${finalRefs} references remain`)
        return { version: final.version, wrote, entities: final.document.entities.length, assets: final.document.assets.length }
    }
    throw new Error(`${projectId}: kept changing under the script (5 tries) — nothing half-done that a re-run will not finish`)
}

const projectsOf = async (client, space, only) => {
    const listed = await client.get(`/api/spaces/${encodeURIComponent(space)}/projects`)
    if (!listed.ok) throw new Error(`listing ${space}'s projects: ${listed.status}`)
    const all = (listed.body?.projects || []).map((p) => p.id)
    return only ? all.filter((id) => id === only) : all
}

/**
 * The whole run for one space. `client` is makeClient's. Returns { projects: [row…], totals }.
 * A row: { id, assets, legacy, refs: {oldId: n}, status: 'nothing'|'dry-run'|'done'|'refused'|'failed', why, map, entries }.
 */
export const runReid = async (client, { space, project = null, dry = false, maxBytes = DEFAULT_MAX_BYTES, undoFile = null }, log = () => {}) => {
    const rows = []
    const undo = { tool: 'assets-reid', space, at: new Date().toISOString(), projects: [] }
    const saveUndo = () => { if (undoFile && !dry) { fs.mkdirSync(path.dirname(undoFile), { recursive: true }); fs.writeFileSync(undoFile, JSON.stringify(undo, null, 2), { mode: 0o600 }) } }
    for (const id of await projectsOf(client, space, project)) {
        const row = { id, assets: 0, legacy: 0, refs: {}, status: 'nothing', why: [], map: {} }
        rows.push(row)
        try {
            const got = await client.get(`/api/projects/${id}/document`)
            if (!got.ok) { row.status = 'failed'; row.why.push(`reading the document: ${got.status}`); continue }
            const doc = got.body.document
            const legacy = legacyAssets(doc)
            row.assets = doc.assets.length
            row.legacy = legacy.length
            if (!legacy.length) continue
            const ids = new Set(legacy.map((a) => a.id))
            // references counted outside the manifest rows themselves
            const found = findRefs({ ...doc, assets: doc.assets.filter((a) => !ids.has(a.id)) }, ids)
            row.refs = found.counts
            const plan = planRewriteOps({ ...doc, assets: [] }, { ...rewriteIds({ ...doc, assets: [] }, Object.fromEntries([...ids].map((x) => [x, `${x}~`]))), assets: [] })
            const reasons = [...found.unsafe, ...plan.refused]
            if (reasons.length) { row.status = 'refused'; row.why = reasons; continue }
            if (dry) { row.status = 'dry-run'; continue }

            // 1-2: bytes down, bytes up
            const entriesByNew = {}
            for (const a of legacy) {
                // An imported asset can live in ANOTHER project's store: its own
                // url names the project that holds the bytes (seen 2026-10-05:
                // open/look-signal's 78 files are main-dii-project's). Ask that
                // project first, then this one.
                const owner = sourceProjectOf(a, id)
                let bytes = await client.bytes(`/api/projects/${owner}/assets/${encodeURIComponent(a.id)}`)
                if (!bytes.ok && owner !== id) bytes = await client.bytes(`/api/projects/${id}/assets/${encodeURIComponent(a.id)}`)
                if (!bytes.ok) { row.why.push(`${a.name || a.id}: download answered ${bytes.status} — left as it is`); continue }
                if (bytes.buffer.byteLength > maxBytes) { row.why.push(`${a.name || a.id}: ${bytes.buffer.byteLength} bytes is over --max-bytes — left as it is`); continue }
                const form = new FormData()
                form.append('asset', new Blob([bytes.buffer], { type: a.mimeType || 'application/octet-stream' }), a.name || a.id)
                const up = await client.post(`/api/projects/${id}/assets`, form)
                const newId = up.body?.asset?.id
                if (!up.ok || !newId || !isCarriableId(newId)) { row.why.push(`${a.name || a.id}: upload answered ${up.status}${newId ? `, id ${newId} is not a checkable name` : ''} — left as it is`); continue }
                row.map[a.id] = newId.toLowerCase()
                entriesByNew[a.id] = { size: up.body.asset.size, mimeType: up.body.asset.mimeType }
            }
            const mapped = Object.keys(row.map)
            if (!mapped.length) { row.status = 'failed'; continue }
            // an old id left behind keeps its references: it is not rewritten, and not dropped
            undo.projects.push({ id, map: row.map, oldEntries: Object.fromEntries(legacy.filter((a) => row.map[a.id]).map((a) => [a.id, a])) })
            saveUndo()
            const entryFor = (oldId, oldEntry) => {
                if (!oldEntry) return null
                const meta = entriesByNew[oldId]
                const base = rewriteIds(oldEntry, { [oldId]: row.map[oldId] })
                return { ...base, id: row.map[oldId], size: meta.size || oldEntry.size, mimeType: meta.mimeType || oldEntry.mimeType }
            }
            const out = await applyMapping(client, id, row.map, entryFor, { log })
            row.status = row.why.length ? 'done-with-leftovers' : 'done'
            row.after = out
        } catch (error) {
            row.status = 'failed'
            row.why.push(String(error?.message || error))
        }
    }
    const totals = rows.reduce((t, r) => ({ projects: t.projects + 1, assets: t.assets + r.assets, legacy: t.legacy + r.legacy, refs: t.refs + Object.values(r.refs).reduce((a, b) => a + b, 0), reided: t.reided + Object.keys(r.map).length, refused: t.refused + (r.status === 'refused' ? 1 : 0), failed: t.failed + (r.status === 'failed' ? 1 : 0) }), { projects: 0, assets: 0, legacy: 0, refs: 0, reided: 0, refused: 0, failed: 0 })
    return { rows, totals, undo }
}

/** --undo: the old entries back, references pointed at the old ids, the new entries dropped. */
export const runUndo = async (client, record, log = () => {}) => {
    const results = []
    for (const p of record.projects || []) {
        const back = Object.fromEntries(Object.entries(p.map).map(([o, n]) => [n, o]))
        try {
            const out = await applyMapping(client, p.id, back, (newId) => p.oldEntries[back[newId]], { log })
            results.push({ id: p.id, ok: true, ...out })
        } catch (error) {
            results.push({ id: p.id, ok: false, why: String(error?.message || error) })
        }
    }
    return results
}

const main = async () => {
    const args = parseArgs()
    const stray = [...Object.keys(args).filter((k) => k !== '_' && !KNOWN_FLAGS.includes(k)).map((k) => `--${k}`), ...(args._ || [])]
    if (stray.length) die(`unknown argument${stray.length > 1 ? 's' : ''}: ${stray.join(' ')} — nothing was done (known: ${KNOWN_FLAGS.map((k) => `--${k}`).join(' ')})`)
    const api = String(args.api || die('needs --api <install>/serverXR')).replace(/\/+$/, '')
    const token = readToken(args['token-file'] ? path.resolve(String(args['token-file'])) : null)
    const client = makeClient(api, token)
    if (args.undo) {
        const record = JSON.parse(fs.readFileSync(path.resolve(String(args.undo)), 'utf8'))
        const results = await runUndo(client, record, say)
        for (const r of results) say(`${r.id}: ${r.ok ? `undone (version ${r.version})` : `FAILED ${r.why}`}`)
        if (results.some((r) => !r.ok)) process.exit(1)
        return
    }
    const space = String(args.space || die('needs --space'))
    const dry = Boolean(args['dry-run'])
    const dir = path.resolve(String(args['undo-dir'] || path.join(os.homedir(), 'di-backups', 'assets-reid')))
    const undoFile = path.join(dir, `assets-reid-${space}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    say(`${dry ? 'DRY RUN — ' : ''}${space} on ${api}`)
    const { rows, totals } = await runReid(client, { space, project: args.project ? String(args.project) : null, dry, maxBytes: Number(args['max-bytes']) || DEFAULT_MAX_BYTES, undoFile }, say)
    for (const r of rows) {
        if (r.status === 'nothing') continue
        const refs = Object.values(r.refs).reduce((a, b) => a + b, 0)
        say(`${r.id}: ${r.assets} assets, ${r.legacy} older → ${dry ? `${r.legacy} would be re-added` : `${Object.keys(r.map).length} re-added`}, ${refs} references in the document [${r.status}]`)
        if (dry && args.verbose) for (const [id, n] of Object.entries(r.refs)) say(`    ${id}: ${n}`)
        else if (dry) { const v = Object.values(r.refs); say(`    references per old id: min ${Math.min(...v)}, max ${Math.max(...v)}, ${v.filter((n) => !n).length} unreferenced (--verbose lists each)`) }
        for (const w of r.why) say(`    ${r.status === 'refused' ? 'REFUSED' : 'note'}: ${w}`)
    }
    say(`${totals.projects} projects, ${totals.assets} assets, ${totals.legacy} older, ${totals.refs} references, ${totals.reided} re-added, ${totals.refused} refused, ${totals.failed} failed${dry ? '' : `; undo record ${undoFile}`}`)
    if (totals.failed || totals.refused) process.exitCode = 2
}

if (isMainModule(import.meta.url)) main().catch((e) => die(e.message))
