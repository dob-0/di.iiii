#!/usr/bin/env node
/**
 * space-cleanup.mjs — the clean-up list the owner said yes to on 2026-10-13 ("clear, keep only needed things"),
 * as one command with an undo. One place for a space, phase P5: the design's §5 table, rows 1-6 and 8.
 *
 *   node scripts/space-cleanup.mjs --api <install>/serverXR [--dry-run]            # the default: print the table, write nothing
 *   node scripts/space-cleanup.mjs --api <install>/serverXR --apply                # rows 1-6 and 8; the journal is written first
 *   node scripts/space-cleanup.mjs --api <install>/serverXR --undo <journal.json>  # put every step back (add --dry-run to read it first)
 *   options: --token-env NAME (default DI_API_TOKEN) · --repo <checkout for the "named in" count, default this one>
 *            --journal-dir <dir> (default $DI_CLEANUP_JOURNAL_DIR, else ~/di-backups/space-cleanup)
 *
 * Rows (CLEANUP_PLAN): 1-4 archive a space (it leaves the default list, nothing is removed), 5-6 move a space to the
 * trash (30 days, restorable), 7 stays, 8 lists the archived project moxir-hall in MOXIR 17.10's version list as
 * `archived` so it is not left behind, 9-11 are only shown. Nothing is purged and nothing is deleted.
 *
 * The token comes from the environment, is sent as a header and is never printed or written. Without it the
 * dry-run still reads (what a visitor sees), but --apply and --undo refuse before they send a request.
 *
 * Why a script and not clicks: `di follow` carries neither a space's archive nor its trash (di.iiii PR #746 limit),
 * so each install is written the same way by the same command: dev first, then the local install.
 * Safety, by design:
 *   - a space is archived or trashed only while it holds 0 projects, read again right before its own write;
 *   - a space this install follows is not trashed; when the follow state cannot be read the table says so and
 *     the trash goes ahead with a warning (GET /api/follows answers on the machine itself only);
 *   - every write is read back; a write that does not read back, or that the server holds for approval, is a failure;
 *   - the journal is written BEFORE the first write and rewritten after every step, so a crash leaves a true record;
 *   - --undo checks the live state of every step, so it can be run twice and never overwrites a later change.
 * Exit code: 0 = done or nothing to do; 1 = could not start (arguments, token, journal); 2 = a step failed, was
 * refused by a guard, or was left alone by the undo, and needs a human look.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { listProjectIdOf } from '../src/shared/productionVersions.js'
import { isMainModule } from './lib/isMainModule.mjs'
import { makeClient } from './place/api.mjs'
import { putNewEntries, readList, readProject, REPO_ROOT, removeEntry, whoAmI } from './production/versionList.mjs'

const execFileP = promisify(execFile)

export const JOURNAL_FORMAT = 'di.space-cleanup-journal'
export const DEFAULT_TOKEN_ENV = 'DI_API_TOKEN'
const TOOL = 'space-cleanup.mjs'
const ID_OK = /^[a-z0-9][a-z0-9-]*$/
/** The script's own files name every id on the list; they are not "use", so the repo count leaves them out. */
const SELF_FILES = ['scripts/space-cleanup.mjs', 'scripts/space-cleanup.test.js', 'docs/ai/sessions/feat-place-p5-2026-10-13.md']

/** The §5 table of docs: rows 1-6 and 8 act, 7 stays, 9-11 are shown only. The owner's yes of 2026-10-13. */
export const CLEANUP_PLAN = Object.freeze([
    { n: 1, kind: 'space', id: 'artist-walk', action: 'archive' },
    { n: 2, kind: 'space', id: 'decisions', action: 'archive' },
    { n: 3, kind: 'space', id: 'drum-rhythms', action: 'archive' },
    { n: 4, kind: 'space', id: 'newcomer-2', action: 'archive' },
    { n: 5, kind: 'space', id: 'newcomer-test', action: 'trash' },
    { n: 6, kind: 'space', id: 'aaa', action: 'trash' },
    { n: 7, kind: 'space', id: 'algovrithm', action: 'keep', why: 'holds a work compiled into di.iiii; its "No projects yet" is fixed in P1' },
    { n: 8, kind: 'project', id: 'moxir-hall', action: 'list-archived', space: 'moxir', production: 'moxir-2026-10-17' },
    { n: 9, kind: 'project', id: 'moxir-truss', action: 'none', space: 'moxir', why: 'stays under Archived, now with its holds line' },
    { n: 10, kind: 'project', id: 'moxir-2026-10-17-versions', action: 'none', space: 'moxir', production: 'moxir-2026-10-17', why: 'no longer a row: it becomes the fold (P3)' },
    { n: 11, kind: 'assets', id: 'moxir', action: 'none', space: 'moxir', why: 'shown as the Space files row (P2)' }
].map((row) => Object.freeze(row)))

const WRITES = new Set(['archive', 'trash', 'list-archived'])

// ── arguments ────────────────────────────────────────────────────────────────────────────────────────────
const VALUE_FLAGS = ['api', 'token-env', 'journal-dir', 'repo', 'undo']
const SWITCH_FLAGS = ['dry-run', 'apply']

export const parseCliArgs = (argv) => {
    const given = {}
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        const name = arg.startsWith('--') ? arg.slice(2) : null
        if (name && SWITCH_FLAGS.includes(name)) given[name] = true
        else if (name && VALUE_FLAGS.includes(name)) {
            const value = argv[i + 1]
            if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value — nothing was done`)
            given[name] = value
            i += 1
        } else throw new Error(`unknown argument ${JSON.stringify(arg)} — nothing was done`)
    }
    if (!given.api) throw new Error('needs --api <install>/serverXR (it has no default on purpose: say which install) — nothing was done')
    try { if (!/^https?:$/.test(new URL(given.api).protocol)) throw new Error('not http') } catch { throw new Error(`--api must be a full address such as https://dev.diiii.xyz/serverXR, not ${JSON.stringify(given.api)} — nothing was done`) }
    const modes = [given.apply ? 'apply' : null, given.undo ? 'undo' : null, given['dry-run'] && !given.undo ? 'dry-run' : null].filter(Boolean)
    if (modes.length > 1) throw new Error('give one of --dry-run, --apply, --undo <journal> (--dry-run may follow --undo) — nothing was done')
    return {
        mode: modes[0] || 'dry-run',
        dry: Boolean(given['dry-run']) || !given.apply && !given.undo,
        api: String(given.api).replace(/\/+$/, ''),
        tokenEnv: given['token-env'] || DEFAULT_TOKEN_ENV,
        journalDir: given['journal-dir'] || null,
        repo: given.repo || null,
        undoFile: given.undo || null
    }
}

// ── the repo check: "named in N repo files" ──────────────────────────────────────────────────────────────
/** Tracked text files that name `id` as a whole token (hyphens belong to the token, so `a-b` is not in `a-b-c`). */
export const repoMentions = async (repo, id, { exclude = SELF_FILES } = {}) => {
    if (!ID_OK.test(String(id))) throw new Error(`${JSON.stringify(id)} is not a space or project id`)
    const pattern = `(^|[^A-Za-z0-9_-])${id}([^A-Za-z0-9_-]|$)`
    try {
        const { stdout } = await execFileP('git', ['-C', repo, 'grep', '-I', '-l', '-E', '-e', pattern, '--', '.', ...exclude.map((file) => `:(exclude)${file}`)], { maxBuffer: 32 * 1024 * 1024 })
        const files = stdout.split('\n').filter(Boolean).sort()
        return { count: files.length, files: files.slice(0, 3) }
    } catch (error) {
        if (error.code === 1 && !error.stderr) return { count: 0, files: [] } // git grep: 1 = no match
        throw new Error(`git grep failed in ${repo}: ${String(error.stderr || error.message).slice(0, 200)}`)
    }
}

// ── reading the install ──────────────────────────────────────────────────────────────────────────────────
/** A client whose calls never throw: a network failure is a status 0 answer with the reason. */
const guarded = (client) => {
    const wrap = (name) => async (...args) => {
        try {
            return await client[name](...args)
        } catch (error) {
            return { status: 0, ok: false, body: null, text: `cannot reach the install: ${error?.cause?.code || error?.message || error}` }
        }
    }
    return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), del: wrap('del'), bytes: client.bytes }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const isoDay = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString().slice(0, 10) : '?')
const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`
const reasonOf = (res) => `${res.status || 'no answer'}${res.body?.error ? ` ${res.body.error}` : res.status === 0 ? ` ${res.text}` : ''}`

const readFollows = async (c) => {
    const res = await c.get('/api/follows')
    if (res.status === 200 && Array.isArray(res.body?.follows) && res.body.carriedHere !== false) {
        return { known: true, bySpace: new Map(res.body.follows.map((f) => [f.spaceId, f])) }
    }
    const why = res.status === 200
        ? 'this server does not carry the follows; another one on the same data folder does'
        : `GET /api/follows answered ${res.status || 'nothing'}; it answers on the machine itself only, not through a proxy or from outside`
    return { known: false, why }
}

const followedOf = (follows, id) => {
    if (!follows.known) return { state: 'unknown', why: follows.why }
    const f = follows.bySpace.get(id)
    return f ? { state: 'yes', remote: f.remote || 'another install', status: f.status || null } : { state: 'no' }
}

const spaceFacts = async (c, id, trashedSpaces) => {
    const got = await c.get(`/api/spaces/${id}`)
    if (got.status === 200) {
        const footprint = await c.get(`/api/spaces/${id}/footprint`)
        let projects = null
        let confirmed = false
        let protectedReason = null
        if (footprint.status === 200 && Number.isFinite(Number(footprint.body?.projects))) {
            projects = Number(footprint.body.projects)
            confirmed = true
            protectedReason = footprint.body.protected || null
        } else {
            const listed = await c.get(`/api/spaces/${id}/projects`)
            if (listed.status === 200 && Array.isArray(listed.body?.projects)) projects = listed.body.projects.length
        }
        const trash = await c.get(`/api/trash?space=${id}`)
        return {
            state: 'live',
            archivedAt: got.body?.space?.archivedAt || null,
            projects,
            confirmed,
            protected: protectedReason,
            trashedProjects: trash.status === 200 && Array.isArray(trash.body?.projects) ? trash.body.projects.length : null
        }
    }
    if (got.status === 404) {
        const trashed = (trashedSpaces || []).find((s) => s.id === id)
        return trashed ? { state: 'trashed', deletedAt: trashed.deletedAt, restorableUntil: trashed.restorableUntil } : { state: 'absent' }
    }
    return { state: 'unreadable', status: got.status, why: reasonOf(got) }
}

const objectsAndLamps = (layers) => {
    if (!layers) return null
    const lamps = Number(layers.lamps) || 0
    return { objects: Math.max(0, (Number(layers.things) || 0) - lamps), lamps }
}

/** Everything the table and the plan need, read live: GET requests only. */
export const readFacts = async ({ client, rows = CLEANUP_PLAN, mentions }) => {
    const c = guarded(client)
    const follows = await readFollows(c)
    const trashRes = await c.get('/api/trash/spaces')
    const trashedSpaces = trashRes.status === 200 && Array.isArray(trashRes.body?.spaces) ? trashRes.body.spaces : null
    const spaceLists = new Map()
    const listOf = async (space) => {
        if (!spaceLists.has(space)) spaceLists.set(space, await c.get(`/api/spaces/${space}/projects`))
        return spaceLists.get(space)
    }
    const byRow = new Map()
    for (const row of rows) {
        const used = {}
        if (row.kind !== 'assets') {
            try { used.mentions = await mentions(row.id) } catch (error) { used.mentions = { count: null, files: [], error: error.message } }
        }
        if (row.kind === 'space') {
            byRow.set(row.n, { ...(await spaceFacts(c, row.id, trashedSpaces)), followed: followedOf(follows, row.id), ...used })
        } else if (row.kind === 'project') {
            const got = await c.get(`/api/projects/${row.id}`)
            if (got.status === 404) { byRow.set(row.n, { state: 'absent', ...used }); continue }
            if (got.status !== 200) { byRow.set(row.n, { state: 'unreadable', status: got.status, why: reasonOf(got), ...used }); continue }
            const meta = got.body?.project || {}
            const listed = (await listOf(row.space)).body?.projects?.find((p) => p.id === row.id)
            const facts = { state: 'present', projectState: meta.state || 'live', documentVersion: meta.documentVersion ?? null, counts: objectsAndLamps(listed?.layers), ...used }
            if (row.production) {
                const list = await readList(c, row.production).catch((error) => ({ exists: false, unreadable: error.message, entries: [] }))
                Object.assign(facts, { listProject: listProjectIdOf(row.production), listExists: list.exists, listUnreadable: list.unreadable || null, entries: list.entries.length })
                if (row.action === 'list-archived') {
                    facts.listedAs = list.entries.find((e) => e.projectId === row.id) || null
                    facts.idTakenBy = list.entries.find((e) => e.id === row.id && e.projectId !== row.id)?.projectId || null
                }
            }
            byRow.set(row.n, facts)
        } else {
            const res = await c.get(`/api/spaces/${row.space}/assets`)
            const assets = res.status === 200 && Array.isArray(res.body?.assets) ? res.body.assets : null
            byRow.set(row.n, assets ? { state: 'present', count: assets.length, bytes: assets.reduce((sum, a) => sum + (Number(a.size) || 0), 0) } : { state: 'unreadable', status: res.status, why: reasonOf(res) })
        }
    }
    return { byRow, follows }
}

// ── the plan: pure ───────────────────────────────────────────────────────────────────────────────────────
const holds = (f) => `holds ${plural(f.projects, 'project')} now (the list said 0)`

const planSpace = (row, f) => {
    if (f.state === 'unreadable') return { state: 'refused', reason: `cannot read it (${f.why})` }
    if (f.state === 'absent') return { state: 'absent', reason: 'not on this install' }
    if (f.state === 'trashed') return { state: 'already', reason: `already in the trash since ${isoDay(f.deletedAt)}; left alone` }
    if (row.action === 'archive' && f.archivedAt) return { state: 'already', reason: 'already archived' }
    if (f.projects === null) return { state: 'refused', reason: 'cannot confirm it holds no project (the count could not be read)' }
    if (f.projects > 0) return { state: 'refused', reason: holds(f) }
    if (!f.confirmed) return { state: 'refused', reason: 'cannot confirm it holds no project (the count is only what a visitor can see; send a token)' }
    if (row.action === 'trash') {
        if (f.protected) return { state: 'refused', reason: `protected (${f.protected}); the server will not delete it` }
        if (f.followed.state === 'yes') return { state: 'refused', reason: `followed from ${f.followed.remote}; trashing it would break the follow (unfollow first, or keep it)` }
    }
    return { state: 'todo', reason: '' }
}

const planProject = (row, f) => {
    if (f.state === 'unreadable') return { state: 'refused', reason: `cannot read it (${f.why})` }
    if (f.state === 'absent') return { state: 'absent', reason: 'not on this install' }
    if (f.listedAs) return { state: 'already', reason: `already listed as "${f.listedAs.id}" (${f.listedAs.status})` }
    if (f.listUnreadable) return { state: 'refused', reason: `the version list cannot be read (${f.listUnreadable})` }
    if (!f.listExists) return { state: 'absent', reason: `no version list ${f.listProject} on this install; it is never made here` }
    if (f.projectState !== 'archived') return { state: 'refused', reason: `not archived now (${f.projectState}); it was archived when the owner said yes, so it is left alone` }
    if (f.idTakenBy) return { state: 'refused', reason: `version id "${row.id}" is taken by project ${f.idTakenBy}` }
    return { state: 'todo', reason: '' }
}

/** One entry per row: { row, state: todo | already | absent | refused | keep | info, reason }. */
export const planRows = (rows, facts) => rows.map((row) => {
    if (row.action === 'keep') return { row, state: 'keep', reason: row.why || '' }
    if (row.action === 'none') return { row, state: 'info', reason: row.why || '' }
    const f = facts.byRow.get(row.n)
    return { row, ...(row.kind === 'space' ? planSpace(row, f) : planProject(row, f)) }
})

// ── the table ────────────────────────────────────────────────────────────────────────────────────────────
const VERBS = {
    archive: () => ['archive', 'unarchive'],
    trash: () => ['trash (30 days)', 'restore'],
    'list-archived': (row) => [`list as archived in ${row.production}'s version list`, 'remove the entry'],
    keep: () => ['keep', '-'],
    none: () => ['nothing', '-']
}
const rowTitle = (row) => (row.kind === 'assets' ? `the files of space ${row.id}` : `${row.kind} ${row.id}`)

const nowText = (row, f) => {
    if (!f) return ''
    if (f.state === 'absent') return 'not on this install'
    if (f.state === 'unreadable') return `cannot read it (${f.why})`
    if (row.kind === 'space') {
        if (f.state === 'trashed') return `in the trash since ${isoDay(f.deletedAt)} (restorable until ${isoDay(f.restorableUntil)})`
        const parts = [f.projects === null ? 'project count unreadable' : `${plural(f.projects, 'project')}${f.confirmed ? '' : ' visible to you; cannot confirm the full count'}`]
        if (f.trashedProjects !== null) parts.push(`${f.trashedProjects} in the trash`)
        parts.push(f.archivedAt ? 'archived' : 'not archived')
        return parts.join(' · ')
    }
    if (row.kind === 'assets') return `${plural(f.count, 'file')} · ${megabytes(f.bytes)}`
    const parts = [f.projectState]
    if (f.documentVersion !== null) parts.push(`v${f.documentVersion}`)
    if (f.counts) parts.push(`${f.counts.objects} objects`, `${f.counts.lamps} lamps`)
    if (row.action === 'list-archived') parts.push(f.listedAs ? `listed as "${f.listedAs.id}" (${f.listedAs.status})` : f.listExists ? 'in no version list' : `no version list ${f.listProject}`)
    else if (row.production && f.listExists) parts.push(`${plural(f.entries, 'version')} in the list`)
    return parts.join(' · ')
}

const usedByText = (row, f) => {
    if (!f || !f.mentions) return ''
    const parts = []
    if (row.kind === 'space' && f.followed) {
        parts.push(f.followed.state === 'yes' ? `followed from ${f.followed.remote}${f.followed.status ? ` (${f.followed.status})` : ''}`
            : f.followed.state === 'no' ? 'not followed' : `followed: unknown (${f.followed.why})`)
    }
    const m = f.mentions
    parts.push(m.count === null ? `repo check failed (${m.error})` : `named in ${plural(m.count, 'repo file')}${m.count ? ` (${m.files.join(', ')}${m.count > m.files.length ? ', …' : ''})` : ''}`)
    return parts.join(' · ')
}

const STATE_TEXT = { todo: 'to do', already: 'already so', absent: 'absent', refused: 'refused', keep: 'kept', info: 'no action' }

export const tableLines = ({ facts, plan }) => {
    const lines = []
    for (const entry of plan) {
        const { row } = entry
        const f = facts.byRow.get(row.n)
        const [verb, undo] = VERBS[row.action](row)
        const state = entry.reason && entry.state !== 'todo' ? `${STATE_TEXT[entry.state]}: ${entry.reason}` : STATE_TEXT[entry.state]
        lines.push(`#${row.n} ${rowTitle(row)} — ${verb}${undo === '-' ? '' : ` (undo: ${undo})`}  [${state}]`)
        const now = nowText(row, f)
        if (now) lines.push(`    now: ${now}`)
        const used = usedByText(row, f)
        if (used) lines.push(`    used by: ${used}`)
    }
    return lines
}

// ── the journal ──────────────────────────────────────────────────────────────────────────────────────────
const writeJournal = (file, journal) => {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(journal, null, 2)}\n`)
    fs.renameSync(tmp, file)
}

const freshJournalPath = (dir, api, now) => {
    fs.mkdirSync(dir, { recursive: true })
    const host = new URL(api).host.replace(/[^a-z0-9.-]/gi, '_')
    const stamp = now().toISOString().replace(/[:.]/g, '-')
    let file = path.join(dir, `space-cleanup-${host}-${stamp}.json`)
    for (let i = 2; fs.existsSync(file); i += 1) file = path.join(dir, `space-cleanup-${host}-${stamp}-${i}.json`)
    return file
}

// ── writing ──────────────────────────────────────────────────────────────────────────────────────────────
class StepFailed extends Error {}
class StepRefused extends Error {}
class LeftAlone extends Error {}

/** A write that did not happen is never a quiet success: not-ok, or held for an approval, is a failure with the server's words. */
const written = (res, what) => {
    if (res.status === 202) throw new StepFailed(`${what}: the server held it for approval (${res.body?.approvalId || 'no id'}); nothing was changed`)
    if (!res.ok) throw new StepFailed(`${what}: ${reasonOf(res)}${res.body?.code ? ` [${res.body.code}]` : ''}`)
    return res
}

/** Right before a write: the space still holds no project (and, for the trash, is not protected). */
const confirmEmpty = async (ctx, step) => {
    const res = await ctx.c.get(`/api/spaces/${step.id}/footprint`)
    if (res.status !== 200 || !Number.isFinite(Number(res.body?.projects))) throw new StepRefused(`cannot confirm it holds no project (footprint: ${reasonOf(res)})`)
    if (Number(res.body.projects) > 0) throw new StepRefused(holds({ projects: Number(res.body.projects) }))
    if (step.action === 'trash' && res.body.protected) throw new StepRefused(`protected (${res.body.protected}); the server will not delete it`)
}

const EXECUTORS = {
    archive: async (ctx, step) => {
        await confirmEmpty(ctx, step)
        written(await ctx.c.patch(`/api/spaces/${step.id}`, { archived: true }), `archive ${step.id}`)
        const back = await ctx.c.get(`/api/spaces/${step.id}`)
        const archivedAt = back.body?.space?.archivedAt
        if (back.status !== 200 || !archivedAt) throw new StepFailed(`READ-BACK DIFFERS: ${step.id} does not read back as archived (GET answered ${back.status})`)
        return { archivedAt }
    },
    trash: async (ctx, step) => {
        await confirmEmpty(ctx, step)
        const res = written(await ctx.c.del(`/api/spaces/${step.id}`), `trash ${step.id}`)
        if (res.body?.trashed !== true) throw new StepFailed(`trash ${step.id}: the server did not say it was trashed (${String(res.text).slice(0, 120)})`)
        const live = await ctx.c.get(`/api/spaces/${step.id}`)
        const trash = await ctx.c.get('/api/trash/spaces')
        if (live.status !== 404 || !trash.body?.spaces?.some((s) => s.id === step.id)) throw new StepFailed(`READ-BACK DIFFERS: ${step.id} is not in the trash after the delete (GET answered ${live.status})`)
        if (Number(res.body.projects) > 0) ctx.log(`  WARNING #${step.n} ${step.id}: ${plural(Number(res.body.projects), 'project')} went to the trash with it (--undo brings them back)`)
        return { deletedAt: res.body.deletedAt, restorableUntil: res.body.restorableUntil, projectsWithIt: Number(res.body.projects) || 0 }
    },
    'list-archived': async (ctx, step) => {
        const project = await readProject(ctx.c, step.id)
        if (!project) throw new StepFailed(`${step.id} is not on this install`)
        const created = Number(project.meta.createdAt)
        const entry = {
            id: step.id,
            projectId: step.id,
            title: project.meta.title || step.id,
            status: 'archived',
            madeFrom: null,
            madeBy: null,
            madeAt: Number.isFinite(created) && created > 0 ? new Date(created).toISOString() : null,
            fingerprint: project.fingerprint,
            listed: { at: ctx.now().toISOString(), by: whoAmI({ api: ctx.api, tool: TOOL }) },
            note: 'Listed by the clean-up of 2026-10-13 (the owner’s yes) so it is not left behind: archived, in no version list.'
        }
        const result = await putNewEntries({ client: ctx.c, api: ctx.api, space: null, create: false, production: step.production, meta: { id: step.production }, dry: false, log: () => {}, undoDir: ctx.undoDir }, [entry])
            .catch((error) => { throw new StepFailed(`list ${step.id}: ${error.message}`) })
        if (!result.added.some((e) => e.id === step.id)) throw new StepFailed(`list ${step.id}: version id "${step.id}" is already in the list; left as it is`)
        const back = await readList(ctx.c, step.production)
        const got = back.entries.find((e) => e.id === step.id)
        if (!got || got.status !== 'archived' || got.projectId !== step.id) throw new StepFailed(`READ-BACK DIFFERS: ${step.id} does not read back as an archived entry of ${step.production}`)
        return { entryId: step.id, production: step.production, listVersion: result.version }
    }
}

const stepOf = (entry) => {
    const { row } = entry
    return {
        n: row.n,
        kind: row.kind,
        id: row.id,
        action: row.action,
        ...(row.production ? { production: row.production } : {}),
        status: 'planned',
        before: row.kind === 'space' ? { archived: false, live: true } : { listed: false, production: row.production }
    }
}

const DONE_TEXT = {
    archive: () => 'archived',
    trash: (step) => `moved to the trash (restorable until ${isoDay(step.evidence?.restorableUntil)})`,
    'list-archived': (step) => `listed as archived in ${step.production}'s version list`
}

const applyPlan = async (ctx, journalFile, journal) => {
    const results = { done: 0, failed: 0, refused: 0 }
    for (const step of journal.steps) {
        step.status = 'started'
        step.at = ctx.now().toISOString()
        writeJournal(journalFile, journal)
        try {
            step.evidence = await EXECUTORS[step.action](ctx, step)
            step.status = 'done'
            results.done += 1
            ctx.log(`  done #${step.n} ${step.id}: ${DONE_TEXT[step.action](step)}`)
        } catch (error) {
            if (error instanceof StepRefused) { step.status = 'refused'; results.refused += 1; ctx.log(`  refused #${step.n} ${step.id}: ${error.message}; left alone`) } else { step.status = 'failed'; results.failed += 1; ctx.log(`  FAILED #${step.n} ${step.id}: ${error.message}`) }
            step.error = error.message
        }
        writeJournal(journalFile, journal)
    }
    return results
}

// ── undoing ──────────────────────────────────────────────────────────────────────────────────────────────
const UNDOERS = {
    archive: async (ctx, step) => {
        const got = await ctx.c.get(`/api/spaces/${step.id}`)
        if (got.status !== 200) throw new StepFailed(`${step.id} is not live (${got.status === 404 ? 'in the trash or gone' : reasonOf(got)}); cannot unarchive it`)
        if (!got.body?.space?.archivedAt) return 'already back'
        if (ctx.dry) return `would unarchive ${step.id}`
        written(await ctx.c.patch(`/api/spaces/${step.id}`, { archived: false }), `unarchive ${step.id}`)
        const back = await ctx.c.get(`/api/spaces/${step.id}`)
        if (back.status !== 200 || back.body?.space?.archivedAt) throw new StepFailed(`READ-BACK DIFFERS: ${step.id} is still archived`)
        return `unarchived ${step.id}`
    },
    trash: async (ctx, step) => {
        const live = await ctx.c.get(`/api/spaces/${step.id}`)
        if (live.status === 200) return 'already back'
        const trash = await ctx.c.get('/api/trash/spaces')
        if (!trash.body?.spaces?.some((s) => s.id === step.id)) throw new StepFailed(`${step.id} is neither live nor in the trash (purged after 30 days?); it cannot be restored`)
        if (ctx.dry) return `would restore ${step.id}`
        written(await ctx.c.post(`/api/spaces/${step.id}/restore`, {}), `restore ${step.id}`)
        const back = await ctx.c.get(`/api/spaces/${step.id}`)
        if (back.status !== 200) throw new StepFailed(`READ-BACK DIFFERS: ${step.id} does not answer after the restore (${back.status})`)
        return `restored ${step.id}`
    },
    'list-archived': async (ctx, step) => {
        const list = await readList(ctx.c, step.production)
        const entry = list.exists ? list.entries.find((e) => e.id === step.id) : null
        if (!entry) return 'already back'
        if (entry.projectId !== step.id || entry.status !== 'archived') throw new LeftAlone(`changed since: "${entry.id}" is now ${entry.status} in ${step.production}'s list; left alone`)
        if (ctx.dry) return `would remove the entry ${step.id} from ${step.production}'s list`
        const result = await removeEntry({ client: ctx.c, api: ctx.api, space: null, create: false, production: step.production, meta: { id: step.production }, dry: false, log: () => {}, undoDir: ctx.undoDir }, step.id)
            .catch((error) => { throw new StepFailed(`remove the entry ${step.id}: ${error.message}`) })
        if (result.status !== 'written') throw new StepFailed(`remove the entry ${step.id}: the list was not written (${result.status})`)
        return `removed the entry ${step.id} from ${step.production}'s list`
    }
}

const undoJournal = async (ctx, journalFile, journal) => {
    const results = []
    let bad = 0
    for (const step of [...journal.steps].reverse()) {
        if (step.status !== 'done' && step.status !== 'started') continue
        try {
            const result = await UNDOERS[step.action](ctx, step)
            results.push({ n: step.n, id: step.id, result })
            ctx.log(`  ${result === 'already back' ? `#${step.n} ${step.id}: already back` : `#${step.n} ${result}`}`)
        } catch (error) {
            bad += 1
            const left = error instanceof LeftAlone
            results.push({ n: step.n, id: step.id, result: left ? 'left alone' : 'failed', error: error.message })
            ctx.log(`  ${left ? 'left alone' : 'FAILED'} #${step.n} ${step.id}: ${error.message}`)
        }
    }
    if (!ctx.dry) {
        journal.undone = { at: ctx.now().toISOString(), results }
        writeJournal(journalFile, journal)
    }
    return bad
}

// ── the command ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * `client`, `env`, `log`, `now`, `mentions` are injectable so the tests run against an in-memory install.
 * Returns { code, mode, plan?, journalFile? }; throws (exit 1) for a start that cannot be made.
 */
export const run = async (argv, { client = null, env = process.env, log = console.log, now = () => new Date(), mentions = null } = {}) => {
    const args = parseCliArgs(argv)
    const token = String(env[args.tokenEnv] || '').trim()
    const writing = args.mode === 'apply' || (args.mode === 'undo' && !args.dry)
    if (writing && !token) {
        throw new Error(`no token: set ${args.tokenEnv} to this install's admin token (it is only sent as a header, never printed or written) — refusing to write; nothing was done`)
    }
    const journalDir = args.journalDir || env.DI_CLEANUP_JOURNAL_DIR || path.join(os.homedir(), 'di-backups', 'space-cleanup')
    const c = guarded(client || makeClient(args.api, token || null))
    const ctx = { c, api: args.api, now, log, dry: args.dry, undoDir: path.join(journalDir, 'versions-undo') }

    if (args.mode === 'undo') {
        let journal
        try { journal = JSON.parse(fs.readFileSync(args.undoFile, 'utf8')) } catch (error) { throw new Error(`cannot read the journal ${args.undoFile}: ${error.message} — nothing was done`) }
        if (journal?.format !== JOURNAL_FORMAT || !Array.isArray(journal.steps)) throw new Error(`${args.undoFile} is not a space-cleanup journal — nothing was done`)
        if (String(journal.api).replace(/\/+$/, '') !== args.api) throw new Error(`this journal was written for ${journal.api}, not ${args.api}; give the same --api — nothing was done`)
        log(`space-cleanup — undo${args.dry ? ' (dry run: nothing is written)' : ''} on ${args.api}, journal ${args.undoFile}`)
        const bad = await undoJournal(ctx, args.undoFile, journal)
        log(bad ? `undo: ${plural(bad, 'step')} could not be put back; see above` : 'undo: every step is back as it was')
        return { code: bad ? 2 : 0, mode: 'undo', journalFile: args.undoFile }
    }

    const repo = args.repo || REPO_ROOT
    const facts = await readFacts({ client: c, mentions: mentions || ((id) => repoMentions(repo, id)) })
    const plan = planRows(CLEANUP_PLAN, facts)
    log(`space-cleanup — ${args.mode === 'apply' ? 'apply' : 'dry run (nothing is written)'} on ${args.api}`)
    if (!token) log(`token: ${args.tokenEnv} is not set; reading as a visitor, so counts the server hides from visitors cannot be confirmed`)
    log('the list is the owner’s yes of 2026-10-13: rows 1-6 and 8 act, row 7 stays, rows 9-11 are only shown')
    for (const line of tableLines({ facts, plan })) log(line)

    const todo = plan.filter((p) => p.state === 'todo' && WRITES.has(p.row.action))
    const refused = plan.filter((p) => p.state === 'refused')
    const count = (state) => plan.filter((p) => p.state === state).length
    log(`plan: ${todo.length} to do · ${count('already')} already so · ${count('absent')} absent · ${refused.length} refused · row 7 kept · rows 9-11 shown only`)
    if (args.mode === 'dry-run') {
        log(`to apply: node scripts/space-cleanup.mjs --api ${args.api} --apply   (${args.tokenEnv} must be set)`)
        return { code: 0, mode: 'dry-run', plan }
    }

    if (!todo.length) {
        log(refused.length ? `nothing to do, but ${plural(refused.length, 'row')} refused (see above)` : 'nothing to do')
        for (const p of refused) log(`  refused #${p.row.n} ${p.row.id}: ${p.reason}`)
        return { code: refused.length ? 2 : 0, mode: 'apply', plan }
    }
    for (const p of todo) {
        const f = facts.byRow.get(p.row.n)
        if (p.row.action === 'trash' && f.followed.state === 'unknown') log(`  WARNING #${p.row.n} ${p.row.id}: followed: unknown (${f.followed.why}); the list says it is not followed, trashing it anyway`)
    }
    for (const p of refused) log(`  refused #${p.row.n} ${p.row.id}: ${p.reason}`)

    const journalFile = freshJournalPath(journalDir, args.api, now)
    const journal = { format: JOURNAL_FORMAT, version: 1, tool: `scripts/${TOOL}`, api: args.api, createdAt: now().toISOString(), steps: todo.map(stepOf), notDone: plan.filter((p) => p.state !== 'todo').map((p) => ({ n: p.row.n, id: p.row.id, state: p.state, reason: p.reason })) }
    writeJournal(journalFile, journal)
    log(`journal written first: ${journalFile}`)
    const results = await applyPlan(ctx, journalFile, journal)
    log(`done ${results.done} · failed ${results.failed} · refused at the write ${results.refused} · refused at the plan ${refused.length}`)
    log(`undo: node scripts/space-cleanup.mjs --api ${args.api} --undo ${journalFile}`)
    return { code: results.failed || results.refused || refused.length ? 2 : 0, mode: 'apply', plan, journalFile }
}

if (isMainModule(import.meta.url)) {
    run(process.argv.slice(2)).then((out) => { process.exitCode = out.code }).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
