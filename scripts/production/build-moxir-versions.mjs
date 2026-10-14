#!/usr/bin/env node
/**
 * build-moxir-versions.mjs — ONE-TIME: build MOXIR's version list (production moxir-2026-10-17, space
 * moxir) on one install, from what its projects already say about themselves.
 * docs/architecture/decisions/2026-10-04-production-versions.md.
 *
 *   node scripts/production/build-moxir-versions.mjs --api https://dev.diiii.xyz/serverXR \
 *       --token-file <dev token file> --dry-run          # read only: prints every entry, writes nothing
 *   node scripts/production/build-moxir-versions.mjs --api https://dev.diiii.xyz/serverXR --token-file <…>
 *
 * Every project of the space is read (GET only). A project carrying a version mark of this production
 * becomes an entry (derive.mjs): `archived` when its own row says archived, `kept-copy` when its mark is a
 * copy of another project (the six `*-oldhall-0929`), `candidate` otherwise — including the two brought
 * from PONYO under their own id (their mark is a copy of itself). NOTHING is for the show: owner,
 * 2026-10-04, "I want to see all first"; he chooses with `versions.mjs set-status <id> for-the-show`.
 * Projects without a mark (moxir-sources, moxir-brief, moxir-truss) are named and left out.
 *
 * Refuses, writing nothing, when two projects claim one version id, or when a `*-oldhall-0929` project does
 * not come out a kept copy (its mark lost — repair it first with copy-version.mjs --adopt). Entries already
 * in the list are left exactly as they are; a second run adds only what is missing. The write is one ops
 * POST to the list project, read back; the undo is printed. Run it on the HUB (dev): every install that
 * follows the space receives the list with the space.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { VERSIONS_FILE } from '../rigbuild/versions.mjs'
import { listProjectIdOf } from '../../src/shared/productionVersions.js'
import { putNewEntries, readList, readProject, REPO_ROOT, whoAmI } from './versionList.mjs'
import { deriveEntry } from './derive.mjs'

export const PRODUCTION = 'moxir-2026-10-17'
export const SPACE = 'moxir'
export const TITLE = 'MOXIR 17.10'
export const KEPT_COPY_SUFFIX = '-oldhall-0929'
export const KNOWN_FLAGS = ['api', 'token-file', 'dry-run', 'space']

/**
 * The plan for MOXIR from the projects read: { entries, skipped, refusals }. Pure.
 * `projects`: readProject() results.
 */
export const planMoxir = (projects, { spec, listedBy, at, install, repoRoot = REPO_ROOT }) => {
    const entries = []
    const skipped = []
    const refusals = []
    for (const project of projects) {
        const d = deriveEntry(project, { production: PRODUCTION, spec, listedBy, at, repoRoot, install })
        if (d.skip) { skipped.push({ projectId: project.projectId, why: d.skip }); continue }
        entries.push({ ...d.entry, why: d.why })
    }
    const byId = new Map()
    for (const e of entries) byId.set(e.id, [...(byId.get(e.id) || []), e.projectId])
    for (const [id, owners] of byId) if (owners.length > 1) refusals.push(`version id "${id}" is claimed by ${owners.length} projects: ${owners.join(', ')}`)
    for (const e of entries) {
        if (e.projectId.endsWith(KEPT_COPY_SUFFIX) && e.status !== 'kept-copy' && e.status !== 'archived') refusals.push(`${e.projectId} should be a kept copy, but its mark does not say what it is a copy of — repair it first (copy-version.mjs --adopt)`)
        if (e.status === 'for-the-show') refusals.push(`${e.projectId} came out for the show — the build never chooses one`)
    }
    return { entries: entries.map(({ why, ...e }) => e), reasons: Object.fromEntries(entries.map((e) => [e.id, e.why])), skipped, refusals }
}

export const run = async (argv, { client = null, log = say } = {}) => {
    // --dry-run is a switch: never let it swallow the word after it (`--dry-run register x`)
    const dryRun = argv.includes('--dry-run')
    const args = { ...parseArgs(argv.filter((a) => a !== '--dry-run')), ...(dryRun ? { 'dry-run': true } : {}) }
    const stray = [...Object.keys(args).filter((k) => k !== '_' && !KNOWN_FLAGS.includes(k)).map((k) => `--${k}`), ...args._]
    if (stray.length) throw new Error(`unknown argument${stray.length > 1 ? 's' : ''}: ${stray.join(' ')} — nothing was done`)
    const api = args.api ? String(args.api).replace(/\/+$/, '') : null
    if (!api) throw new Error('needs --api <install>/serverXR — it has no default on purpose')
    const tokenFile = args['token-file'] ? path.resolve(String(args['token-file'])) : null
    const c = client || makeClient(api, readToken(tokenFile))
    const space = String(args.space || SPACE)
    const dry = Boolean(args['dry-run'])
    const install = new URL(api).host

    const rows = await c.get(`/api/spaces/${space}/projects`)
    if (!rows.ok) throw new Error(`reading the projects of ${space}: ${rows.status} ${String(rows.text || '').slice(0, 200)}`)
    const ids = (rows.body?.projects || []).map((p) => p.id).filter((id) => id && id !== listProjectIdOf(PRODUCTION))
    const projects = []
    for (const id of ids) {
        const p = await readProject(c, id)
        if (p) projects.push(p)
    }
    const spec = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, VERSIONS_FILE), 'utf8'))
    const plan = planMoxir(projects, { spec, listedBy: whoAmI({ api, tool: 'build-moxir-versions.mjs' }), at: new Date().toISOString(), install })

    log(`${space} on ${install}: ${ids.length} projects read; ${plan.entries.length} versions of ${PRODUCTION}`)
    for (const e of plan.entries) log(`  ${e.status.padEnd(10)} ${e.id.padEnd(30)} ${e.projectId}${e.madeFrom ? ` · from ${e.madeFrom}` : ''} — ${plan.reasons[e.id]}`)
    for (const s of plan.skipped) log(`  not a version: ${s.projectId} — ${s.why}`)
    log('  for the show: none chosen (the owner chooses: versions.mjs set-status <id> for-the-show)')
    if (plan.refusals.length) throw new Error(`not built, nothing written:\n${plan.refusals.map((r) => `  - ${r}`).join('\n')}`)
    const before = await readList(c, PRODUCTION)
    if (before.exists) log(`the list ${listProjectIdOf(PRODUCTION)} exists already with ${before.entries.length} entries; only missing ones are added`)
    return putNewEntries({ client: c, api, tokenFile, space, production: PRODUCTION, meta: { id: PRODUCTION, title: TITLE, space, codeList: VERSIONS_FILE }, dry, log }, plan.entries)
}

if (isMainModule(import.meta.url)) {
    run(process.argv.slice(2)).catch((error) => die(error.message))
}
