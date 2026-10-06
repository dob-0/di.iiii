#!/usr/bin/env node
/**
 * versions-audit.mjs — does every copy of a production agree on its versions? READ ONLY.
 * docs/architecture/decisions/2026-10-04-production-versions.md.
 *
 *   node scripts/production/versions-audit.mjs --production moxir-2026-10-17 \
 *       --side dev=https://dev.diiii.xyz/serverXR --token dev=<dev token file> \
 *       --side local=https://local.thedi.studio/serverXR --token local=~/.di/di.env
 *
 * Compares, per version and by name: the version list on each install (the list itself, entry by entry),
 * the version's project on each install (present? the same work? — the fingerprint, versionList.mjs), the
 * projects that carry a version mark of the production but are not in the list, and the code in git: every
 * version the production's versions file names is in the list, and every rig file a version was made from
 * is in git (and, when the making tool pinned its blob, unchanged since).
 *
 * Exit 0: everything agrees. Exit 1: any mismatch (each one printed, by name). Exit 2: an install could
 * not be read. Notes (exit 0): a version edited since it was listed (its fingerprint moved on every
 * install alike) — work goes on in a version; the list records the state it was listed in.
 *
 * When to run it: after a follow has settled (`di follows` says quiet), after a land/deploy to dev, and
 * before the show. Wiring it into CI needs the dev token as a secret — owed, see the decision note.
 */
import fs from 'node:fs'
import path from 'node:path'

import { say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { forTheShow } from '../../src/shared/productionVersions.js'
import { gitBlob, readList, readProject, REPO_ROOT } from './versionList.mjs'
import { codeVersionIds } from './derive.mjs'

const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))
const and = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** argv with repeatable `--side name=url` and `--token name=file`. Pure. */
export const parseAuditArgs = (argv) => {
    const out = { sides: [], tokens: {}, production: null, space: null, git: true, stray: [] }
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i]
        const next = () => { i += 1; return argv[i] }
        if (a === '--side') {
            const [name, ...url] = String(next() || '').split('=')
            if (!name || !url.length) out.stray.push(`--side ${name || ''} (needs name=url)`)
            else out.sides.push({ name, api: url.join('=').replace(/\/+$/, '') })
        } else if (a === '--token') {
            const [name, ...file] = String(next() || '').split('=')
            out.tokens[name] = file.join('=')
        } else if (a === '--production') out.production = next()
        else if (a === '--space') out.space = next()
        else if (a === '--no-git') out.git = false
        else out.stray.push(a)
    }
    return out
}

/**
 * The comparison, no I/O. `sides`: [{ name, list (readList), projects: { [projectId]: { mark, fingerprint } | null } }].
 * `git`: null (skipped) or { spec (the versions file, parsed, or null), codeList, blobOf(file) → blob | null }.
 * Returns { lines, mismatches, notes }.
 */
export const compareVersions = ({ production, sides, git }) => {
    const lines = []
    const mismatches = []
    const notes = []
    const miss = (text) => { mismatches.push(text); lines.push(`  ✗ ${text}`) }
    const names = sides.map((s) => s.name)

    // 1. the list itself, on each install
    lines.push(`The version list of ${production}:`)
    for (const s of sides) {
        if (!s.list.exists) { miss(`there is no version list on ${s.name}`); continue }
        const show = forTheShow(s.list.entries)
        lines.push(`  ${s.name}: ${s.list.entries.length} versions, for the show: ${show ? show.title : 'none chosen'}`)
        for (const p of s.list.problems) miss(`${s.name}: ${p}`)
    }
    const withList = sides.filter((s) => s.list.exists)
    if (withList.length > 1) {
        const listMismatchesBefore = mismatches.length
        const ids = [...new Set(withList.flatMap((s) => s.list.entries.map((v) => v.id)))].sort()
        for (const id of ids) {
            const held = withList.map((s) => [s.name, s.list.entries.find((v) => v.id === id)])
            const absent = held.filter(([, v]) => !v).map(([n]) => n)
            if (absent.length) { miss(`the list on ${and(absent)} does not have "${id}" (${held.find(([, v]) => v)[1].title})`); continue }
            const forms = new Set(held.map(([, v]) => stable(v)))
            if (forms.size > 1) {
                const statuses = new Set(held.map(([, v]) => v.status))
                miss(`the lists disagree on "${id}"${statuses.size > 1 ? `: ${held.map(([n, v]) => `${v.status} on ${n}`).join(', ')}` : ' (same status, other fields differ)'}`)
            }
        }
        if (mismatches.length === listMismatchesBefore) lines.push(`  the list is the same on ${and(withList.map((s) => s.name))}`)
    }

    // 2. each version's project, on each install
    const entries = new Map()
    for (const s of withList) for (const v of s.list.entries) if (!entries.has(v.id)) entries.set(v.id, v)
    lines.push('Each version:')
    for (const v of [...entries.values()]) {
        const label = `${v.title} (${v.id} · ${v.projectId}, ${v.status})`
        const have = sides.map((s) => [s.name, s.projects[v.projectId] || null])
        const absent = have.filter(([, p]) => !p).map(([n]) => n)
        const present = have.filter(([, p]) => p)
        if (absent.length) miss(`${label}: missing on ${and(absent)}`)
        const prints = new Set(present.map(([, p]) => p.fingerprint))
        if (present.length > 1 && prints.size > 1) miss(`${label}: differs — ${present.map(([n, p]) => `${n} ${p.fingerprint.slice(7, 19)}`).join(' ≠ ')}`)
        else if (!absent.length) {
            const moved = v.fingerprint && present.every(([, p]) => p.fingerprint !== v.fingerprint)
            lines.push(`  ✓ ${label}: same on ${and(present.map(([n]) => n))}${moved ? ' — edited since it was listed' : ''}`)
            if (moved) notes.push(`${v.title}: edited since it was listed (${v.listed?.at?.slice(0, 10) || 'date not known'})`)
        }
    }

    // 3. versions of this production that the list does not know
    for (const s of sides) {
        const listed = new Set((s.list.entries || []).map((v) => v.projectId))
        for (const [projectId, p] of Object.entries(s.projects)) {
            if (p?.mark?.set === production && !listed.has(projectId)) miss(`${p.mark.title || p.mark.id} (${p.mark.id} · ${projectId}) on ${s.name} is a version of ${production} but not in ${s.list.exists ? 'its' : 'any'} list`)
        }
    }

    // 4. the code in git
    if (git) {
        lines.push(`The code (${git.codeList || 'no versions file named by the list'}):`)
        const gitMismatchesBefore = mismatches.length
        const listedIds = new Set(entries.keys())
        for (const id of codeVersionIds(git.spec)) if (!listedIds.has(id)) miss(`"${id}" is named in ${git.codeList} but is not in the list`)
        for (const v of entries.values()) {
            if (!v.rig?.file) continue
            const blob = git.blobOf(v.rig.file)
            if (!blob) miss(`${v.title} (${v.id}) was made from ${v.rig.file}, which git does not hold`)
            else if (v.rig.blob && v.rig.blob !== blob) miss(`${v.title} (${v.id}): ${v.rig.file} has changed in git since the version was made (${v.rig.blob.slice(0, 10)} → ${blob.slice(0, 10)})`)
        }
        if (mismatches.length === gitMismatchesBefore) lines.push('  ✓ every version the code names is listed, every rig file listed is in git')
    }
    lines.push(mismatches.length ? `${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'} across ${and(names)}${git ? ' and git' : ''}.` : `All agree: ${and(names)}${git ? ' and git' : ''}.`)
    return { lines, mismatches, notes }
}

/** Read one install's projects of the space: every one that is listed or carries a mark of the production (GET only). */
export const readSide = async (client, { name, production, space, list }) => {
    const rows = await client.get(`/api/spaces/${space}/projects`)
    if (!rows.ok) throw new Error(`${name}: reading the projects of ${space}: ${rows.status}`)
    const projects = {}
    const ids = new Set([...(rows.body?.projects || []).map((p) => p.id), ...list.entries.map((v) => v.projectId)])
    for (const id of ids) {
        if (id === `${production}-versions`) continue
        const p = await readProject(client, id)
        if (p && (p.mark?.set === production || list.entries.some((v) => v.projectId === id))) projects[id] = { mark: p.mark, fingerprint: p.fingerprint }
    }
    return { name, list, projects }
}

export const run = async (argv, { clients = {}, log = say, repoRoot = REPO_ROOT } = {}) => {
    const args = parseAuditArgs(argv)
    if (args.stray.length) throw Object.assign(new Error(`unknown argument${args.stray.length > 1 ? 's' : ''}: ${args.stray.join(' ')} — nothing was read`), { exit: 2 })
    if (!args.production) throw Object.assign(new Error('needs --production <id>'), { exit: 2 })
    if (!args.sides.length) throw Object.assign(new Error('needs at least one --side name=<install>/serverXR'), { exit: 2 })
    const failed = (s, error) => Object.assign(new Error(`${s.name} (${s.api}) could not be read: ${error.message}`), { exit: 2 })
    const reading = []
    for (const s of args.sides) {
        const client = clients[s.name] || makeClient(s.api, readToken(args.tokens[s.name] ? path.resolve(args.tokens[s.name]) : null))
        try {
            reading.push({ ...s, client, list: await readList(client, args.production) })
        } catch (error) {
            throw failed(s, error)
        }
    }
    // the space: given, or what any install's list says (an install with no list is still read)
    const space = args.space || reading.map((s) => s.list.production?.space).find(Boolean)
    if (!space) throw Object.assign(new Error('no install has a list to say which space, and no --space was given'), { exit: 2 })
    const sides = []
    for (const s of reading) {
        try {
            sides.push(await readSide(s.client, { name: s.name, production: args.production, space, list: s.list }))
        } catch (error) {
            throw failed(s, error)
        }
    }
    const codeList = sides.map((s) => s.list.production?.codeList).find(Boolean) || null
    const spec = codeList && fs.existsSync(path.join(repoRoot, codeList)) ? JSON.parse(fs.readFileSync(path.join(repoRoot, codeList), 'utf8')) : null
    const git = args.git ? { spec, codeList, blobOf: (file) => gitBlob(file, repoRoot) } : null
    if (git && codeList && !spec) log(`note: the list names ${codeList}, which this checkout does not have`)
    const result = compareVersions({ production: args.production, sides, git })
    result.lines.forEach((l) => log(l))
    result.notes.forEach((n) => log(`note: ${n}`))
    return { ...result, exit: result.mismatches.length ? 1 : 0 }
}

if (isMainModule(import.meta.url)) {
    run(process.argv.slice(2))
        .then((r) => process.exit(r.exit))
        .catch((error) => { console.error(error.message); process.exit(error.exit || 2) })
}

