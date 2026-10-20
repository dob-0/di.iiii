#!/usr/bin/env node
/**
 * show-checkpoint.mjs — snapshot a show's running state, and put it back in one command.
 *
 * Owner, 2026-10-17: "so you collect every info and we have now the check point right". Before a
 * show change, this keeps: the project document (serverXR), the light desk's looks / cues / rig /
 * state / layers, any side files you name, a versions.txt, a manifest.json, a RESTORE.md and
 * (unless --no-copy) a private copy project in the space.
 *
 *   node scripts/rigbuild/show-checkpoint.mjs --project <slug> --space <slug> [--api <url>] [--token-file <f>]
 *       [--out <dir>] [--include <file>]… [--no-copy] [--dry-run]
 *       (the default token ~/.di/di.env is used only with the default --api; any other --api needs --token-file)
 *   node scripts/rigbuild/show-checkpoint.mjs --restore <dir> [--yes] [--force-overwrite]   # refuses if the project is newer than the saved version; without --yes: prints the plan only
 *
 * Exit code is non-zero when the document cannot be fetched. A desk fetch that fails is written
 * into manifest.json (`failures`), never skipped quietly. Restore PUTs the saved document back to
 * the project named in the manifest; it never creates or deletes a project.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeClient, readToken } from '../place/api.mjs'

export const DEFAULT_API = 'http://diiii.localhost/serverXR'
export const DEFAULT_TOKEN_FILE = '~/.di/di.env'
export const DESK_ROUTES = (project) => [
    ['desk-looks', '/light/api/looks'],
    ['desk-cues', '/light/api/cues'],
    ['desk-rig', `/light/api/rig?project=${encodeURIComponent(project)}`],
    ['desk-state', '/light/api/state'],
    ['desk-layers', '/light/api/layers']
]

const VALUE_FLAGS = new Set(['project', 'space', 'api', 'token-file', 'out', 'include', 'restore'])
const BOOL_FLAGS = new Set(['no-copy', 'dry-run', 'yes', 'force-overwrite'])

/** The owner's default token goes ONLY to the default api; any other server needs its own --token-file. */
export const tokenFileFor = (api, tokenFile) => {
    if (tokenFile) return tokenFile
    if (api === DEFAULT_API) return DEFAULT_TOKEN_FILE
    throw new Error(`refusing to send the default token (${DEFAULT_TOKEN_FILE}) to ${api}: pass --token-file <file> for that server`)
}

export const parseArgs = (argv) => {
    const opts = { api: DEFAULT_API, tokenFile: undefined, include: [], noCopy: false, dryRun: false, yes: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`)
        const name = a.slice(2)
        if (BOOL_FLAGS.has(name)) {
            opts[name.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true
        } else if (VALUE_FLAGS.has(name)) {
            const v = argv[++i]
            if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`)
            if (name === 'include') opts.include.push(v)
            else opts[name.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v
        } else throw new Error(`unknown flag: ${a}`)
    }
    if (opts.restore) return opts
    if (!opts.project) throw new Error('--project <slug> is required')
    if (!opts.noCopy && !opts.space) throw new Error('--space <slug> is required for the copy project (or pass --no-copy)')
    return opts
}

const pad = (n) => String(n).padStart(2, '0')
export const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
export const defaultOut = (project, d, home = os.homedir()) => path.join(home, 'di-backups', `${project}-checkpoint-${stamp(d)}`)
export const copySlug = (project, d) => `${project}-checkpoint-${stamp(d).slice(0, 10)}`
export const expandHome = (p, home = os.homedir()) => (p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p)
/** The desk is served by the same host as serverXR: http://host/serverXR → http://host. */
export const deskBase = (api) => new URL(api).origin

export const countDocument = (document) => {
    const ents = document?.entities || []
    return {
        entities: ents.length,
        fixtures: ents.filter((e) => e.components?.fixture).length,
        looks: ents.find((e) => e.id === 'rig-show')?.components?.rigLooks?.looks?.length ?? null
    }
}

export const buildManifest = ({ project, space, api, version, counts, files, failures, copy, when, diVersion }) => ({
    kind: 'show-checkpoint',
    schema: 1,
    project,
    space: space || null,
    api,
    version,
    counts,
    files,
    failures,
    copy: copy || null,
    when: when.toISOString(),
    diVersion
})

/** What a restore would do — pure, so it is testable and printed before anything is sent. */
export const planRestore = (manifest, dirFiles) => {
    if (manifest?.kind !== 'show-checkpoint') throw new Error('not a show checkpoint (manifest.json missing or wrong kind)')
    const docFile = (manifest.files || []).find((f) => /^document-v.+\.json$/.test(f))
    if (!docFile) throw new Error('manifest lists no document file')
    if (dirFiles && !dirFiles.includes(docFile)) throw new Error(`${docFile} is listed but missing from the directory`)
    return { project: manifest.project, api: manifest.api, docFile, route: `/api/projects/${manifest.project}/document`, entities: manifest.counts?.entities ?? null, version: manifest.version }
}

export const restoreText = ({ manifest, dir, scriptPath = 'scripts/rigbuild/show-checkpoint.mjs' }) => `# ${manifest.project} checkpoint ${manifest.when}

What: project ${manifest.project} document v${manifest.version} (${manifest.counts.entities} entities, ${manifest.counts.fixtures} fixtures, ${manifest.counts.looks ?? 'no'} looks), the desk's looks/cues/rig/state/layers as served, and the side files listed in manifest.json.
${manifest.copy ? `In di: private project ${manifest.copy} (space ${manifest.space}), the same document.` : 'No copy project was made (--no-copy).'}
${manifest.failures.length ? `Failures while taking it: ${manifest.failures.join('; ')}` : 'No fetch failures.'}

Restore the project document (from a di.iiii tree; without --yes it only prints the plan):

    node ${scriptPath} --restore ${dir} --yes [--token-file <file>]   # same server as ${manifest.api}; the default token ~/.di/di.env is used only for the default api (${DEFAULT_API}), any other server needs --token-file

If the project was saved again after this checkpoint (its version is newer than v${manifest.version}), the restore refuses and prints both versions; add --force-overwrite to replace the newer work anyway.

Side files and the desk's saved JSON are kept for reading; load the desk again with your show's own loader.
`

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch (e) { return `(${e.message.split('\n')[0]})` } }

export const takeCheckpoint = async (opts, { client, fetchFn = fetch, now = new Date(), log = console.log } = {}) => {
    const out = opts.out ? expandHome(opts.out) : defaultOut(opts.project, now)
    const failures = []
    const files = []
    const r = await client.get(`/api/projects/${opts.project}/document`)
    if (!r.ok || !r.body?.document) throw new Error(`document fetch failed for ${opts.project}: HTTP ${r.status}`)
    const counts = countDocument(r.body.document)
    const version = r.body.version
    const docFile = `document-v${version}.json`
    if (opts.dryRun) {
        log(`dry-run: would write ${out}`)
        log(`dry-run: document ${opts.project} v${version}: ${counts.entities} entities, ${counts.fixtures} fixtures, ${counts.looks ?? 'no'} looks`)
    } else {
        fs.mkdirSync(out, { recursive: true })
        fs.writeFileSync(path.join(out, docFile), JSON.stringify(r.body))
    }
    files.push(docFile)
    for (const [name, route] of DESK_ROUTES(opts.project)) {
        try {
            const res = await fetchFn(`${deskBase(opts.api)}${route}`)
            const text = await res.text()
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (!opts.dryRun) fs.writeFileSync(path.join(out, `${name}.json`), text)
            files.push(`${name}.json`)
        } catch (e) { failures.push(`${name}: ${e.message}`) }
    }
    for (const inc of opts.include) {
        const from = expandHome(inc)
        try {
            if (!opts.dryRun) fs.copyFileSync(from, path.join(out, path.basename(from)))
            else fs.accessSync(from)
            files.push(path.basename(from))
        } catch (e) { failures.push(`include ${inc}: ${e.message}`) }
    }
    const diVersion = sh('di version | head -1')
    let copy = null
    if (!opts.noCopy) {
        const slug = copySlug(opts.project, now)
        if (opts.dryRun) log(`dry-run: would create private project ${slug} in space ${opts.space}`)
        else {
            const made = await client.post(`/api/spaces/${opts.space}/projects`, { title: `${opts.project} — checkpoint ${stamp(now)}`, slug, visibility: 'private' })
            const put = made.ok ? await client.put(`/api/projects/${slug}/document`, r.body.document) : null
            if (made.ok && put.ok) copy = slug
            else failures.push(`copy ${slug}: create ${made.status}${put ? `, document ${put.status}` : ''}`)
        }
    }
    const manifest = buildManifest({ project: opts.project, space: opts.space, api: opts.api, version, counts, files: [...files, 'manifest.json', 'versions.txt', 'RESTORE.md'], failures, copy, when: now, diVersion })
    if (!opts.dryRun) {
        fs.writeFileSync(path.join(out, 'versions.txt'), [`when ${now.toString()}`, `installed di ${diVersion}`, `document ${opts.project} v${version}: ${counts.entities} entities, ${counts.fixtures} fixtures, ${counts.looks ?? 'no'} looks`].join('\n') + '\n')
        fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
        fs.writeFileSync(path.join(out, 'RESTORE.md'), restoreText({ manifest, dir: out }))
    }
    return { out, manifest }
}

export const runRestore = async (opts, { client, log = console.log } = {}) => {
    const dir = expandHome(opts.restore)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    const plan = planRestore(manifest, fs.readdirSync(dir))
    log(`restore plan: PUT ${plan.api}${plan.route} from ${path.join(dir, plan.docFile)} (v${plan.version}, ${plan.entities} entities)`)
    const cur = await client.get(plan.route)
    const newer = cur?.ok && Number(cur.body?.version) > Number(plan.version)
    const lost = `project is at v${cur?.body?.version} (${cur?.body?.document?.entities?.length ?? '?'} entities now), the checkpoint is v${plan.version} (${plan.entities} entities): a restore would replace the newer work`
    if (!cur?.ok) log(`warning: could not read the current version of ${plan.project} (HTTP ${cur?.status})`)
    else if (newer) log(`${opts.yes && !opts.forceOverwrite ? 'REFUSED' : 'warning'}: ${lost}`)
    if (!opts.yes) { log('not sent: add --yes to do it'); return { sent: false, plan } }
    if (newer && !opts.forceOverwrite) throw new Error(`restore refused: ${lost}. Add --force-overwrite to do it anyway.`)
    const saved = JSON.parse(fs.readFileSync(path.join(dir, plan.docFile), 'utf8'))
    const res = await client.put(plan.route, saved.document)
    if (!res.ok) throw new Error(`restore failed: HTTP ${res.status}${[401, 403, 404].includes(res.status) ? ` (the token or the api may be wrong: it was sent to ${plan.api}; pass --api and --token-file for that server)` : ''}`)
    log(`restored ${plan.project}: HTTP ${res.status}`)
    return { sent: true, plan }
}

const main = async () => {
    let opts
    try { opts = parseArgs(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(2) }
    if (opts.restore) {
        let manifest
        try { manifest = JSON.parse(fs.readFileSync(path.join(expandHome(opts.restore), 'manifest.json'), 'utf8')) } catch (e) { console.error(`cannot read manifest: ${e.message}`); process.exit(2) }
        let token
        try { token = readToken(expandHome(tokenFileFor(manifest.api, opts.tokenFile))) } catch (e) { console.error(e.message); process.exit(2) }
        if (!token) { console.error('no token found (--token-file)'); process.exit(2) }
        try { await runRestore(opts, { client: makeClient(manifest.api, token) }) } catch (e) { console.error(e.message); process.exit(1) }
        return
    }
    let token
    try { token = readToken(expandHome(tokenFileFor(opts.api, opts.tokenFile))) } catch (e) { console.error(e.message); process.exit(2) }
    if (!token) { console.error('no token found (--token-file)'); process.exit(2) }
    try {
        const { out, manifest } = await takeCheckpoint(opts, { client: makeClient(opts.api, token) })
        console.log(`${opts.dryRun ? 'dry-run ' : ''}checkpoint ${manifest.project} v${manifest.version}: ${manifest.counts.entities} entities, ${manifest.files.length} files, ${manifest.failures.length} failures${manifest.copy ? `, copy ${manifest.copy}` : ''} -> ${out}`)
        for (const f of manifest.failures) console.log(`FAILED ${f}`)
    } catch (e) { console.error(e.message); process.exit(1) }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
