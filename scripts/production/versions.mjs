#!/usr/bin/env node
/**
 * versions.mjs — a production's VERSION LIST on one install: read it, register a version, set a status.
 * docs/architecture/decisions/2026-10-04-production-versions.md. (Not scripts/rigbuild/versions.mjs, which
 * GENERATES the rig files of MOXIR's versions.)
 *
 *   node scripts/production/versions.mjs --api https://dev.diiii.xyz/serverXR --token-file <file> \
 *       --production moxir-2026-10-17 list
 *   … set-status <version id> <for-the-show|candidate|kept-copy|archived>   # refuses a second for-the-show
 *   … register <project id> [--made-from <version id>] [--note "…"]        # an existing project, from its own mark
 *   … put --file <entry.json>                                                # an entry exactly (what an undo prints)
 *   … remove <version id>                                                    # out of the list; the project stays
 *   add --dry-run to any write: the ops are printed, nothing is written.
 *
 * Writes go through the list project's ops route (versionList.mjs): re-read, one POST at the version just
 * read, read back, and the undo printed. The list is born private in the space (--space, or the space of
 * the registered project). Point it only at an install you mean: there is no default address.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { forTheShow, listProjectIdOf, VERSION_STATUSES } from '../../src/shared/productionVersions.js'
import { putEntry, readList, readProject, removeEntry, REPO_ROOT, setStatus, whoAmI } from './versionList.mjs'
import { deriveEntry } from './derive.mjs'

export const KNOWN_FLAGS = ['api', 'token-file', 'production', 'space', 'dry-run', 'file', 'made-from', 'note', 'title']
export const COMMANDS = ['list', 'set-status', 'register', 'put', 'remove']

const readJsonFile = (file) => JSON.parse(fs.readFileSync(path.resolve(String(file)), 'utf8'))

/** The list as plain lines, by name. Pure. */
export const describeList = (list, production) => {
    if (!list.exists) return [`${production}: no version list on this install (no project ${listProjectIdOf(production)})`]
    const show = forTheShow(list.entries)
    const lines = [
        `${list.production?.title || production} — ${list.entries.length} version${list.entries.length === 1 ? '' : 's'} (list version ${list.version})`,
        `for the show: ${show ? `${show.title} (${show.id}, ${show.projectId})` : 'none chosen'}`
    ]
    for (const status of VERSION_STATUSES) {
        const of = list.entries.filter((v) => v.status === status)
        if (!of.length) continue
        lines.push(`${status} (${of.length}):`)
        for (const v of of) lines.push(`  ${v.title} — ${v.id} · ${v.projectId}${v.madeFrom ? ` · from ${v.madeFrom}` : ''}${v.madeAt ? ` · ${v.madeAt.slice(0, 10)}` : ''}`)
    }
    for (const p of list.problems) lines.push(`PROBLEM: ${p}`)
    return lines
}

export const run = async (argv, { client = null, log = say } = {}) => {
    // --dry-run is a switch: never let it swallow the word after it (`--dry-run register x`)
    const dryRun = argv.includes('--dry-run')
    const args = { ...parseArgs(argv.filter((a) => a !== '--dry-run')), ...(dryRun ? { 'dry-run': true } : {}) }
    const stray = Object.keys(args).filter((k) => k !== '_' && !KNOWN_FLAGS.includes(k))
    if (stray.length) throw new Error(`unknown argument${stray.length > 1 ? 's' : ''}: ${stray.map((k) => `--${k}`).join(' ')} — nothing was done`)
    const [command, ...rest] = args._
    if (!COMMANDS.includes(command)) throw new Error(`needs a command: ${COMMANDS.join(' · ')}`)
    const api = args.api ? String(args.api).replace(/\/+$/, '') : null
    if (!api) throw new Error('needs --api <install>/serverXR — it has no default on purpose')
    const tokenFile = args['token-file'] ? path.resolve(String(args['token-file'])) : null
    const c = client || makeClient(api, readToken(tokenFile))
    const dry = Boolean(args['dry-run'])

    if (command === 'register') {
        const projectId = rest[0] || null
        if (!projectId) throw new Error('register needs a project id')
        const project = await readProject(c, projectId)
        if (!project) throw new Error(`${projectId} is not on ${api}`)
        const production = String(args.production || project.mark?.set || '')
        if (!production) throw new Error(`${projectId} has no version mark to say which production it belongs to — pass --production`)
        const current = await readList(c, production)
        const codeList = current.production?.codeList || null
        const spec = codeList && fs.existsSync(path.join(REPO_ROOT, codeList)) ? readJsonFile(path.join(REPO_ROOT, codeList)) : null
        const derived = deriveEntry(project, { production, spec, listedBy: whoAmI({ api, tool: 'versions.mjs register' }), at: new Date().toISOString(), repoRoot: REPO_ROOT, install: new URL(api).host })
        if (derived.skip) throw new Error(`${projectId}: not registered — ${derived.skip}`)
        const entry = { ...derived.entry, ...(args['made-from'] ? { madeFrom: String(args['made-from']) } : {}), ...(args.note ? { note: String(args.note) } : {}) }
        // a version already listed keeps its status (the owner's word) and its making; registering again re-records its fingerprint
        const had = current.entries.find((v) => v.id === entry.id)
        const next = had ? { ...had, title: entry.title, fingerprint: entry.fingerprint, listed: entry.listed } : entry
        log(`${projectId}: ${had ? `already listed as "${had.id}" (${had.status}) — its fingerprint is recorded again` : `version "${entry.id}", ${entry.status} (${derived.why})`}`)
        const space = String(args.space || project.meta.spaceId || '')
        return putEntry({ client: c, api, tokenFile, space, production, meta: { id: production, title: String(args.title || production), space, codeList: codeList || '' }, dry, log }, next)
    }

    const production = String(args.production || '')
    if (!production) throw new Error('needs --production <id> (the set id, e.g. moxir-2026-10-17)')
    const ctx = { client: c, api, tokenFile, space: args.space ? String(args.space) : null, production, meta: { id: production }, dry, log }

    if (command === 'list') {
        const list = await readList(c, production)
        describeList(list, production).forEach((l) => log(l))
        return { status: 'read', list }
    }
    if (command === 'set-status') {
        const [id, status] = rest
        if (!id || !status) throw new Error(`set-status needs a version id and one of ${VERSION_STATUSES.join(' · ')}`)
        return setStatus(ctx, id, status)
    }
    if (command === 'remove') {
        if (!rest[0]) throw new Error('remove needs a version id')
        return removeEntry(ctx, rest[0])
    }
    // put
    if (!args.file) throw new Error('put needs --file <entry.json>')
    return putEntry(ctx, readJsonFile(args.file))
}

if (isMainModule(import.meta.url)) {
    run(process.argv.slice(2)).catch((error) => die(error.message))
}
