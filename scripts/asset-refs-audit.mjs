#!/usr/bin/env node
/**
 * asset-refs-audit.mjs — name every project whose document points at bytes its
 * tier does not have.
 *
 * A missing asset is the quietest failure this platform has. The document
 * loads, the page renders, the server answers 404 to a fetch nobody is
 * watching, and the only signal is a grey rectangle in a browser someone has
 * to be looking at. `beyond-form/open-call` sat like that on the dev box and
 * on staging — 13 GLBs referenced, none present — while every transfer script
 * reported success, because the ids lived in built markup and never in
 * `document.assets` (see `document-asset-refs.mjs`).
 *
 * This walks a tier's spaces, reads each project document, collects every
 * asset id the document depends on, and asks the tier for it. Exits 1 when
 * anything is missing, so it can gate a deploy instead of waiting for a
 * visitor to notice.
 *
 * Usage:
 *   node scripts/asset-refs-audit.mjs [options]
 *
 * Options:
 *   --tier <local|staging|prod|all>   Which tier to check (default: local)
 *   --base  <url>     API base — overrides --tier
 *   --token <token>   Bearer token (default: the tier's own, from the env or
 *                     serverXR/.env.local). Without one only public spaces are
 *                     visible, and a private space reads as "not there".
 *   --space   <id>    Check only this space (repeatable)
 *   --project <id>    Check only this project (repeatable)
 *   --json            Machine-readable report on stdout
 *   --quiet           Print only the projects that are missing something
 *
 * Example — the check that would have caught it:
 *   node scripts/asset-refs-audit.mjs --tier staging --space beyond-form
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectProjectAssetRefs } from './document-asset-refs.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const TIERS = {
    local: { url: 'http://localhost:4000/serverXR', tokenEnv: 'API_TOKEN' },
    staging: { url: 'https://staging.di-studio.xyz/serverXR', tokenEnv: 'LIVE_API_TOKEN' },
    prod: { url: 'https://di-studio.xyz/serverXR', tokenEnv: 'PROD_API_TOKEN' },
}

export const parseArgs = (argv) => {
    const args = { tier: 'local', base: null, token: null, spaces: [], projects: [], json: false, quiet: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--tier') { args.tier = argv[++i]; continue }
        if (arg === '--base' || arg === '--to' || arg === '--from') { args.base = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--space') { args.spaces.push(argv[++i]); continue }
        if (arg === '--project') { args.projects.push(argv[++i]); continue }
        if (arg === '--json') { args.json = true; continue }
        if (arg === '--quiet') { args.quiet = true; continue }
    }
    return args
}

const loadEnvFile = async (filePath) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8')
        const env = {}
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const idx = trimmed.indexOf('=')
            if (idx === -1) continue
            const key = trimmed.slice(0, idx).trim()
            const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
            if (key && value) env[key] = value
        }
        return env
    } catch {
        return {}
    }
}

const REQUEST_TIMEOUT_MS = 30000

const request = async (url, token, method = 'GET') => {
    const headers = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(url, { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

const getJson = async (url, token) => {
    const res = await request(url, token)
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText} — ${url}`), { status: res.status })
    return res.json()
}

/**
 * One project's verdict. Split out so a test can drive it with a stub fetcher
 * and never touch a network.
 *
 * `probe(id)` answers true when the tier holds that asset. A 401/403 is NOT a
 * miss — reporting "missing" for a file we were merely not allowed to see is
 * how an audit teaches people to ignore it — so those are surfaced separately
 * as `unreadable`.
 */
export const auditProjectDocument = async ({ spaceId, projectId, document, probe }) => {
    const refs = collectProjectAssetRefs(document, projectId)
    const missing = []
    const unreadable = []
    for (const ref of refs) {
        const verdict = await probe(ref.id)
        if (verdict === true) continue
        if (verdict === 'unreadable') unreadable.push(ref)
        else missing.push(ref)
    }
    return { spaceId, projectId, referenced: refs.length, missing, unreadable }
}

const probeFactory = (base, projectId, token) => async (assetId) => {
    const res = await request(`${base}/api/projects/${projectId}/assets/${assetId}/meta`, token)
    if (res.ok) return true
    if (res.status === 401 || res.status === 403) return 'unreadable'
    return false
}

const auditTier = async ({ name, base, token, spaces, projects }) => {
    const spaceList = (await getJson(`${base}/api/spaces`, token))?.spaces || []
    const wanted = spaceList.filter((s) => !spaces.length || spaces.includes(s.id) || spaces.includes(s.slug))
    const reports = []
    for (const space of wanted) {
        let projectList = []
        try {
            projectList = (await getJson(`${base}/api/spaces/${space.id}/projects`, token))?.projects || []
        } catch (error) {
            reports.push({ tier: name, spaceId: space.id, projectId: null, error: error.message })
            continue
        }
        for (const project of projectList) {
            if (projects.length && !projects.includes(project.id)) continue
            try {
                const document = (await getJson(`${base}/api/projects/${project.id}/document`, token))?.document
                const probe = probeFactory(base, project.id, token)
                reports.push({ tier: name, ...(await auditProjectDocument({ spaceId: space.id, projectId: project.id, document, probe })) })
            } catch (error) {
                reports.push({ tier: name, spaceId: space.id, projectId: project.id, error: error.message })
            }
        }
    }
    return reports
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const env = { ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR/.env.local'))), ...process.env }
    const tierNames = args.base ? ['custom'] : (args.tier === 'all' ? Object.keys(TIERS) : [args.tier])

    const reports = []
    for (const name of tierNames) {
        const tier = TIERS[name]
        if (!args.base && !tier) {
            console.error(`Unknown tier "${name}" — one of ${Object.keys(TIERS).join(', ')}, or --base <url>.`)
            process.exitCode = 2
            return
        }
        const base = (args.base || tier.url).replace(/\/+$/, '')
        const token = args.token || (tier ? env[tier.tokenEnv] : null) || env.API_TOKEN || null
        if (!args.json) console.log(`\n${name} · ${base}${token ? '' : ' (no token — public spaces only)'}`)
        try {
            reports.push(...(await auditTier({ name, base, token, spaces: args.spaces, projects: args.projects })))
        } catch (error) {
            console.error(`  could not read ${base}: ${error.message}`)
            process.exitCode = 2
            return
        }
    }

    const broken = reports.filter((r) => r.missing?.length || r.error)
    if (args.json) {
        console.log(JSON.stringify({ ok: broken.length === 0, reports }, null, 2))
    } else {
        for (const r of reports) {
            if (r.error) { console.log(`  ✗ ${r.spaceId}/${r.projectId || '—'}: ${r.error}`); continue }
            if (!r.missing.length) {
                if (!args.quiet) console.log(`  · ${r.spaceId}/${r.projectId}: ${r.referenced} referenced, all present`)
                continue
            }
            console.log(`  ✗ ${r.spaceId}/${r.projectId}: ${r.missing.length} of ${r.referenced} referenced assets MISSING`)
            for (const ref of r.missing) console.log(`      ${ref.id}${ref.name ? ` (${ref.name})` : ''} — from ${ref.source}`)
        }
        console.log(broken.length
            ? `\n${broken.length} project(s) reference assets their tier does not have.`
            : `\nEvery referenced asset is present.`)
    }
    if (broken.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
    main().catch((error) => { console.error(error); process.exit(2) })
}
