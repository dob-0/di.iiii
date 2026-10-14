/**
 * versionList.mjs — read and write a production's version list on one di.iiii install, over its API.
 * docs/architecture/decisions/2026-10-04-production-versions.md.
 *
 * The list is a project of the space (`<production>-versions`, born private) holding one entity per
 * version (src/shared/productionVersions.js). It is written ONLY through the ops route — never a whole
 * document PUT — because `di follow` carries ops and refuses whole-document replacements
 * (serverXR/src/follow/followPlan.js WHOLE_WORK_OPS). Every write: re-read, plan on what was just read,
 * one ops POST at that version (a 409 re-reads and plans again, up to 3 times), read back and compare,
 * and print the command that undoes it. `dry` prints the plan and writes nothing.
 *
 * The fingerprint of a version is sha256 over the document as tier-sync normalises it for its audit:
 * without the per-install stamps (tier-sync.mjs VOLATILE_PATHS: projectMeta createdAt/updatedAt, …)
 * and with every asset addressed by its NAME, not its content id (the upload route re-hashes a file, so
 * the same work holds different ids on two installs — tier-sync.mjs `byName`).
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { byName, stripVolatile } from '../tier-sync.mjs'
import {
    entryOps, listProjectIdOf, normalizeProductionVersion, productionOps, removeOps, statusOps, versionsFromDocument
} from '../../src/shared/productionVersions.js'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CLIENT_ID = 'production-versions'
const WRITE_ATTEMPTS = 3

/** sha256 of the normalised document (see the header). Same work on two installs → the same fingerprint. Pure. */
export const fingerprintOf = (document) => `sha256:${crypto.createHash('sha256').update(byName(stripVolatile(document ?? {}))).digest('hex')}`

/** The commit this checkout is at, `+dirty` when tracked files differ from it; null outside a git checkout. */
export const gitCommit = (root = REPO_ROOT) => {
    try {
        const head = execFileSync('git', ['-C', root, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        return dirty ? `${head}+dirty` : head
    } catch {
        return null
    }
}

/** The git blob id of a repo file at HEAD (what `git ls-tree` prints), or null when git does not hold it. */
export const gitBlob = (file, root = REPO_ROOT) => {
    try {
        const out = execFileSync('git', ['-C', root, 'ls-tree', 'HEAD', '--', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        return out ? out.split(/\s+/)[2] : null
    } catch {
        return null
    }
}

/** The git blob id of a file AS IT IS on disk (git hash-object — the id git gives it once committed), or null. */
export const fileBlob = (file, root = REPO_ROOT) => {
    try {
        return execFileSync('git', ['-C', root, 'hash-object', '--', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
    } catch {
        return null
    }
}

/** Who is writing: this machine, the install written to (its host), the tool, the commit. */
export const whoAmI = ({ api, tool, machine = os.hostname(), commit = gitCommit() }) => {
    let install = null
    try { install = new URL(api).host } catch { install = api ? String(api) : null }
    return { machine, install, tool, commit }
}

const listPath = (production) => `/api/projects/${listProjectIdOf(production)}`

/** The list as the install holds it: { exists, version, document, production, entries, problems }. Throws on any answer but 200 / 404. */
export const readList = async (client, production) => {
    const got = await client.get(`${listPath(production)}/document`)
    if (got.status === 404) return { exists: false, version: null, document: null, production: null, entries: [], problems: [] }
    if (!got.ok) throw new Error(`reading the version list ${listProjectIdOf(production)}: ${got.status} ${String(got.text || '').slice(0, 200)}`)
    const document = got.body?.document || { entities: [] }
    return { exists: true, version: Number(got.body?.version) || 0, document, ...versionsFromDocument(document) }
}

/** Make the list's project (private: the statuses are the production's own decisions) when it is not there. */
const createList = async (client, { space, production, title }) => {
    const id = listProjectIdOf(production)
    const made = await client.post(`/api/spaces/${space}/projects`, { slug: id, title: `${title || production} — versions`, visibility: 'private' })
    if (!made.ok && made.status !== 409) throw new Error(`making the version list ${id} in ${space}: ${made.status} ${String(made.text || '').slice(0, 200)}`)
    const madeId = made.body?.project?.id || made.body?.id || id
    if (made.ok && madeId !== id) throw new Error(`the server made ${madeId}, not ${id} — stopping (remove it with DELETE /api/projects/${madeId})`)
}

/**
 * Plan, write, read back. `plan(document)` returns { ops, … } from the document just read (or throws a
 * refusal). `check(listAfter)` says whether the read-back holds what was meant. Returns the plan's
 * result plus { status: 'nothing' | 'dry-run' | 'written', version }.
 */
const writeWith = async (client, { space, production, meta, dry, log, plan, check, create = true }) => {
    let list = await readList(client, production)
    if (!list.exists) {
        if (!create) throw new Error(`there is no version list for ${production} on this install (${listProjectIdOf(production)}) — register a version first`)
        // plan on the empty list first: a refusal makes nothing, not even the list's project
        const planned = plan({ entities: [] })
        const ops = [...productionOps({ entities: [] }, meta), ...planned.ops]
        if (dry) {
            log(`--dry-run: would make the private project ${listProjectIdOf(production)} in ${space || '(no space given)'} and write ${ops.length} op${ops.length > 1 ? 's' : ''}:`)
            log(JSON.stringify(ops, null, 2))
            return { ...planned, status: 'dry-run', ops }
        }
        if (!space) throw new Error(`the version list for ${production} does not exist yet and no space was given to make it in`)
        await createList(client, { space, production, title: meta?.title })
        list = await readList(client, production)
        if (!list.exists) throw new Error(`made ${listProjectIdOf(production)} but cannot read it back`)
        log(`${production}: made the version list ${listProjectIdOf(production)} (private) in ${space}`)
    }
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
        if (attempt > 1) list = await readList(client, production)
        const planned = plan(list.document)
        const ops = [...productionOps(list.document, meta), ...planned.ops]
        if (!ops.length) return { ...planned, status: 'nothing', version: list.version }
        if (dry) {
            log(`--dry-run: would write ${ops.length} op${ops.length > 1 ? 's' : ''} to ${listProjectIdOf(production)}:`)
            log(JSON.stringify(ops, null, 2))
            return { ...planned, status: 'dry-run', ops }
        }
        const stamp = Date.now()
        const out = await client.post(`${listPath(production)}/ops`, { baseVersion: list.version, ops: ops.map((op, i) => ({ ...op, opId: `${CLIENT_ID}-${stamp}-${i}`, clientId: CLIENT_ID })) })
        if (out.status === 409) { log(`  the list moved while writing (409) — reading it again (${attempt} of ${WRITE_ATTEMPTS})`); continue }
        if (!out.ok) throw new Error(`writing the version list: ${out.status} ${String(out.text || '').slice(0, 300)} — nothing was written`)
        const back = await readList(client, production)
        const problem = check(back)
        if (problem) throw new Error(`the list was written (version ${list.version} → ${back.version}) but reads back wrong: ${problem}`)
        if (back.problems.length) throw new Error(`the list reads back with a problem: ${back.problems.join('; ')}`)
        return { ...planned, status: 'written', version: back.version }
    }
    throw new Error(`the version list kept moving: ${WRITE_ATTEMPTS} attempts, each refused with 409 — nothing was written`)
}

const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))
const sameEntry = (a, b) => Boolean(a && b) && stable(normalizeProductionVersion(a)) === stable(normalizeProductionVersion(b))

/** Where the previous state of an entry is kept for its undo, and the file written. */
export const UNDO_DIR = path.join(os.homedir(), '.di', 'versions-undo')
const saveUndo = (production, entry, given = null) => {
    const dir = given || process.env.DI_VERSIONS_UNDO_DIR || UNDO_DIR
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${production}-${entry.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`)
    return file
}

/** The command line that reaches the same list, for the undo lines. */
export const cliBase = ({ api, tokenFile, production }) => `node scripts/production/versions.mjs --api ${api}${tokenFile ? ` --token-file ${tokenFile}` : ''} --production ${production}`

/**
 * Put one entry in the list (new, or replacing the one with its id). `ctx`: { client, api, tokenFile,
 * space, production, meta, dry, log, undoDir }. Prints the undo: `remove <id>` for a new entry, `put
 * --file <the previous entry>` for a replaced one.
 */
export const putEntry = async (ctx, entry) => {
    const { client, production, log = () => {} } = ctx
    const result = await writeWith(client, {
        ...ctx,
        log,
        plan: (document) => entryOps(document, entry),
        check: (back) => (sameEntry(back.entries.find((v) => v.id === entry.id), entry) ? null : `entry "${entry.id}" is not what was written`)
    })
    if (result.status === 'written') {
        const base = cliBase(ctx)
        log(`${production}: version "${result.entry.id}" (${result.entry.projectId}) is ${result.entry.status} — list version ${result.version}`)
        if (result.before) log(`  undo: ${base} put --file ${saveUndo(production, result.before, ctx.undoDir)}`)
        else log(`  undo: ${base} remove ${result.entry.id}`)
    } else if (result.status === 'nothing') log(`${production}: version "${entry.id}" is already listed exactly so — nothing to do`)
    return result
}

/**
 * Put several NEW entries in one write (the one-time build of a production's list). Entries whose id is
 * already listed are left exactly as they are — the list's statuses are the owner's word once given.
 * Returns the write's result plus { added, kept }. The undo printed takes each added entry out again.
 */
export const putNewEntries = async (ctx, entries) => {
    const { client, production, log = () => {} } = ctx
    let added = []
    let kept = []
    const result = await writeWith(client, {
        ...ctx,
        log,
        plan: (document) => {
            const have = new Set(versionsFromDocument(document).entries.map((v) => v.id))
            added = entries.filter((e) => !have.has(e.id))
            kept = entries.filter((e) => have.has(e.id))
            let doc = { ...document, entities: [...(document.entities || [])] }
            const ops = []
            for (const entry of added) {
                const planned = entryOps(doc, entry)
                ops.push(...planned.ops)
                doc = { ...doc, entities: [...doc.entities, ...planned.ops.map((op) => op.payload.entity)] }
            }
            return { ops }
        },
        check: (back) => {
            const wrong = added.filter((e) => !sameEntry(back.entries.find((v) => v.id === e.id), e)).map((e) => e.id)
            return wrong.length ? `${wrong.length} entr${wrong.length === 1 ? 'y' : 'ies'} not as written: ${wrong.join(', ')}` : null
        }
    })
    if (result.status === 'written') {
        log(`${production}: ${added.length} version${added.length === 1 ? '' : 's'} listed, ${kept.length} already there and left as they are — list version ${result.version}`)
        if (added.length) log(`  undo: for id in ${added.map((e) => e.id).join(' ')}; do ${cliBase(ctx)} remove $id; done`)
    }
    return { ...result, added, kept }
}

/** Change one version's status (refuses a second for-the-show). */
export const setStatus = async (ctx, id, status) => {
    const { client, production, log = () => {} } = ctx
    const result = await writeWith(client, {
        ...ctx,
        log,
        create: false,
        plan: (document) => statusOps(document, id, status),
        check: (back) => (back.entries.find((v) => v.id === id)?.status === status ? null : `"${id}" does not read back as ${status}`)
    })
    if (result.status === 'written') {
        log(`${production}: "${id}" ${result.before.status} → ${status} — list version ${result.version}`)
        log(`  undo: ${cliBase(ctx)} set-status ${id} ${result.before.status}`)
    } else if (result.status === 'nothing') log(`${production}: "${id}" is already ${status} — nothing to do`)
    return result
}

/** Take one version out of the list (its project is not touched). */
export const removeEntry = async (ctx, id) => {
    const { client, production, log = () => {} } = ctx
    const result = await writeWith(client, {
        ...ctx,
        log,
        create: false,
        plan: (document) => removeOps(document, id),
        check: (back) => (back.entries.some((v) => v.id === id) ? `"${id}" is still in the list` : null)
    })
    if (result.status === 'written') {
        log(`${production}: "${id}" taken out of the list (the project ${result.before.projectId} is untouched) — list version ${result.version}`)
        log(`  undo: ${cliBase(ctx)} put --file ${saveUndo(production, result.before, ctx.undoDir)}`)
    }
    return result
}

const markOf = (document) => (Array.isArray(document?.entities) ? document.entities : []).map((e) => e?.components?.rigVariant).find((m) => m && typeof m === 'object' && m.id) || null

/**
 * What a project says about itself, read from the install: { projectId, meta, version, mark, fingerprint }.
 * `mark` is its rigVariant (the version mark rigbuild writes), or null.
 */
export const readProject = async (client, projectId) => {
    const meta = await client.get(`/api/projects/${projectId}`)
    if (meta.status === 404) return null
    if (!meta.ok) throw new Error(`reading ${projectId}: ${meta.status}`)
    const doc = await client.get(`/api/projects/${projectId}/document`)
    if (!doc.ok) throw new Error(`reading ${projectId}'s document: ${doc.status}`)
    const document = doc.body?.document || {}
    return { projectId, meta: meta.body?.project || {}, version: Number(doc.body?.version) || 0, mark: markOf(document), fingerprint: fingerprintOf(document), document }
}

/** A project archived by its own record: state `archived`, or the old `[archived]` title (projectRoutes.js isLegacyArchivedTitle). */
export const isArchived = (meta = {}) => meta.state === 'archived' || String(meta.title || '').trimStart().startsWith('[archived]')

/**
 * The entry a tool writes for a version it has JUST MADE (load-version, copy-version): read the project
 * back, fingerprint it, and say who made it. Pure but for the one read. `extra` may carry madeFrom, rig, note.
 */
export const madeEntry = async (client, { api, projectId, id, title, status, tool, madeFrom = null, rig = null, note = '', madeBy = null }) => {
    const project = await readProject(client, projectId)
    if (!project) throw new Error(`${projectId} is not on ${api} — nothing to list`)
    const now = new Date().toISOString()
    const me = whoAmI({ api, tool })
    return {
        id,
        projectId,
        title: title || project.mark?.title || project.meta.title || id,
        status,
        madeFrom,
        madeBy: madeBy || me,
        madeAt: now,
        fingerprint: project.fingerprint,
        ...(rig ? { rig } : {}),
        listed: { at: now, by: me },
        note
    }
}

/** The production's short title from a versions file's title ("MOXIR 17.10 — three versions…" → "MOXIR 17.10"). Pure. */
export const productionTitleOf = (spec, fallback) => String(spec?.title || fallback || '').split(' — ')[0].trim() || String(fallback || '')

/**
 * Called by a tool that has JUST MADE (or re-made) a version — load-version.mjs, copy-version.mjs: list it
 * in the same step. A version already listed under that id keeps its status (the owner's word); its
 * making (madeBy, madeAt, fingerprint, rig) is the new one. `production`: the set id from the project's
 * mark. Throws with the command that finishes the job when the list cannot be written — the version
 * itself is already made and is not undone.
 */
export const recordMadeVersion = async ({ client, api, tokenFile = null, space, production, title, codeList = '', projectId, id, tool, status = 'candidate', madeFrom = null, rig = null, madeBy = null, note = '', remade = true, log = () => {} }) => {
    try {
        const made = await madeEntry(client, { api, projectId, id, title: null, status, tool, madeFrom, rig, madeBy, note })
        const list = await readList(client, production)
        const had = list.entries.find((v) => v.id === id)
        // remade = false (a tool that only re-marked a version): a listed one keeps its making and is re-fingerprinted
        const entry = had ? (remade ? { ...made, status: had.status } : { ...had, fingerprint: made.fingerprint, listed: made.listed }) : made
        return await putEntry({ client, api, tokenFile, space, production, meta: { id: production, title: title || production, space, codeList }, dry: false, log }, entry)
    } catch (error) {
        throw new Error(`${projectId} is made, but the version list ${listProjectIdOf(production)} was not written: ${error.message}\n  finish it with: node scripts/production/versions.mjs --api ${api}${tokenFile ? ` --token-file ${tokenFile}` : ''} register ${projectId}`)
    }
}
