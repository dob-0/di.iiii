/**
 * space-push.mjs — push a space scene to the live server.
 *
 * Reads from spaces/{spaceId}/scene.json (git-tracked) first.
 * Falls back to the local dev server API if the file doesn't exist.
 *
 * Usage:
 *   node scripts/space-push.mjs <spaceId> [options]
 *
 * Options:
 *   --to     <url>    Live server API base (default: $LIVE_API_URL or https://di-studio.xyz/serverXR)
 *   --token  <token>  Bearer token for the live server (default: $LIVE_API_TOKEN) — required
 *   --dry-run         Print what would happen without making changes
 *   --force           Push even if the destination changed since this scene's
 *                     own `version` field was last read (see below) — the
 *                     escape hatch, not the default
 *
 * Set LIVE_API_TOKEN in .env.local (never commit it):
 *   echo 'LIVE_API_TOKEN=your-editor-token' >> .env.local
 *
 * Refuses a stale destination. The scene this script pushes carries its own
 * `version` (what it was BASED ON); before writing, this script reads the
 * destination's CURRENT version and refuses if it moved — someone else's
 * edit would otherwise be silently overwritten by a `PUT` that has no
 * precondition of its own. The write itself also sends `If-Match` (the same
 * precondition `PUT /api/spaces/:id/scene` already understands server-side —
 * see serverXR/src/routes/spaceRoutes.js), so a change landing in the gap
 * between this check and the request still gets caught, as a 409, not a
 * silent overwrite.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

// Production is the one host this script must never reach by inheritance.
// Matches the live site under both its names (di-studio.xyz, diiii.xyz); the dev
// tier (dev.diiii.xyz) is a different hostname and is unaffected.
export const isProductionTarget = (url) => {
    try {
        const { hostname } = new URL(url)
        return ['di-studio.xyz', 'www.di-studio.xyz', 'diiii.xyz', 'www.diiii.xyz'].includes(hostname)
    } catch {
        return false
    }
}

const parseArgs = (argv) => {
    const args = { spaceId: null, from: null, to: null, token: null, dryRun: false, allowProduction: false, force: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            if (!args.spaceId) args.spaceId = arg
            continue
        }
        if (arg === '--from') { args.from = argv[++i]; continue }
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--dry-run') { args.dryRun = true; continue }
        if (arg === '--allow-production') { args.allowProduction = true; continue }
        if (arg === '--force') { args.force = true; continue }
    }
    return args
}

// Read-only: what version does the destination hold RIGHT NOW. `verbatim=1`
// asks for what is actually stored rather than a hydrated/filtered rendering
// (see the route's own comment) — the only shape it is safe to compare a
// version number against. Returns null when the space does not exist yet on
// the destination (nothing to be stale relative to) or the read itself
// failed — the two cases are distinguished by `notFound`.
const readDestinationVersion = async (toBase, spaceId, token) => {
    let response
    try {
        response = await fetch(`${toBase}/api/spaces/${spaceId}/scene?verbatim=1`, { headers: buildHeaders(token) })
    } catch (error) {
        return { version: null, notFound: false, error: error?.message || String(error) }
    }
    if (response.status === 404) return { version: null, notFound: true, error: null }
    if (!response.ok) return { version: null, notFound: false, error: `HTTP ${response.status}` }
    const body = await response.json().catch(() => ({}))
    const version = Number.isInteger(body?.version) ? body.version : null
    return { version, notFound: false, error: null }
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
            // An empty assignment is a placeholder, not a value. The root
            // .env carries `LIVE_API_TOKEN=` with nothing after it; honouring
            // it blanked the real token and this script then ran unauthenticated.
            if (key && value) env[key] = value
        }
        return env
    } catch {
        return {}
    }
}

const buildHeaders = (token, ifMatchVersion) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (Number.isInteger(ifMatchVersion)) headers['If-Match'] = `"${ifMatchVersion}"`
    return headers
}

const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, options)
    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`)
    }
    return response.json()
}

const main = async () => {
    const localEnv = {
        // serverXR/.env.local is where the tokens actually live; the root pair
        // carries the URLs. Reading only the root pair is why this script could
        // not see LIVE_API_TOKEN at all.
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))

    if (!args.spaceId) {
        console.error('Usage: node scripts/space-push.mjs <spaceId> [--to <url>] [--token <token>] [--dry-run]')
        process.exitCode = 1
        return
    }

    const fromBase = (args.from || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const toBase = (args.to || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const { spaceId, dryRun } = args

    // Production has to be named out loud. This script's fallback IS production
    // (DEFAULT_LIVE_URL), and the root .env sets LIVE_API_URL to production
    // while .env.local overrides it to the dev tier — so deleting or losing one line
    // in an untracked file silently turns a routine push into a live one. The
    // convention everywhere else is LIVE_* = the dev tier, PROD_* = production, so a
    // LIVE_API_URL pointing at production is already the anomaly.
    if (isProductionTarget(toBase) && !args.to && !args.allowProduction) {
        console.error(`Refusing to push to PRODUCTION (${toBase}) without being told to.`)
        console.error('Nothing was read or written.\n')
        console.error('This was not asked for on the command line — it came from the environment:')
        console.error(`  LIVE_API_URL = ${getEnv('LIVE_API_URL') || '(unset, so the built-in production default was used)'}`)
        console.error('\nIf you meant the dev tier: check .env.local still sets LIVE_API_URL to https://dev.diiii.xyz/serverXR')
        console.error('If you really meant production, say so:')
        console.error(`  node scripts/space-push.mjs ${spaceId} --to ${toBase} --dry-run`)
        process.exitCode = 1
        return
    }

    if (!token) {
        console.error('Error: LIVE_API_TOKEN is required to push to the live server.')
        console.error('Add it to .env.local:  LIVE_API_TOKEN=your-editor-token')
        process.exitCode = 1
        return
    }

    // 1. Read scene — prefer git-tracked file, fall back to local API
    let scene
    let baseVersion = null // the version this scene was BASED ON, if known
    const trackedScenePath = path.join(ROOT_DIR, 'spaces', spaceId, 'scene.json')
    console.log(`[space-push] ${spaceId}`)
    try {
        const raw = await fs.readFile(trackedScenePath, 'utf8')
        scene = JSON.parse(raw)
        if (Number.isInteger(scene?.version)) baseVersion = scene.version
        console.log(`  source: spaces/${spaceId}/scene.json  (git-tracked)`)
    } catch {
        console.log(`  spaces/${spaceId}/scene.json not found, fetching from local server`)
        const localSceneUrl = `${fromBase}/api/spaces/${spaceId}/scene`
        const result = await apiFetch(localSceneUrl)
        scene = result.scene
        if (Number.isInteger(result.version)) baseVersion = result.version
        console.log(`  source: ${localSceneUrl}`)
    }
    const objCount = Array.isArray(scene?.objects) ? scene.objects.length : 0
    const assetCount = Array.isArray(scene?.assets) ? scene.assets.length : 0
    console.log(`  to:     ${toBase}`)
    console.log(`  scene:  ${objCount} objects, ${assetCount} assets${baseVersion !== null ? ` (based on v${baseVersion})` : ' (no known base version)'}`)

    // 1b. Refuse a stale destination. This is a read, so it happens whether or
    // not --dry-run was passed — a dry run should say what a real push would
    // refuse, not stay silent about it.
    const destination = await readDestinationVersion(toBase, spaceId, token)
    if (destination.error) {
        console.error(`Could not confirm the destination hasn't changed (${destination.error}).`)
        if (!args.force) {
            console.error('Refusing to push blind. If you have verified it by hand, re-run with --force.')
            process.exitCode = 1
            return
        }
        console.error('--force: pushing anyway.')
    } else if (!destination.notFound && baseVersion !== null && destination.version !== null && destination.version !== baseVersion) {
        console.error(`Refusing to push: the destination is at v${destination.version}, but this scene is based on v${baseVersion}.`)
        console.error(`Someone else's change would be overwritten. Pull first:`)
        console.error(`  node scripts/space-pull.mjs ${spaceId} --from ${toBase}`)
        console.error('Then re-apply your changes on top, or re-run with --force to overwrite anyway.')
        if (!args.force) {
            process.exitCode = 1
            return
        }
        console.error('--force: pushing anyway.')
    } else if (!destination.notFound && baseVersion === null && destination.version !== null && !args.force) {
        console.error(`This scene carries no version to compare against the destination's current v${destination.version}.`)
        console.error('Cannot confirm it is not stale. Re-run with --force if you have verified it by hand.')
        process.exitCode = 1
        return
    }

    if (dryRun) {
        console.log('dry-run: skipping push')
        return
    }

    // 2. Push scene to live. If-Match is the same precondition the server
    // already understands for this route (see the file header) — belt and
    // braces against a change landing in the gap between the read above and
    // this request.
    const livePutUrl = `${toBase}/api/spaces/${spaceId}/scene`
    console.log(`Pushing scene to ${livePutUrl}`)
    const putResponse = await fetch(livePutUrl, {
        method: 'PUT',
        headers: buildHeaders(token, args.force ? undefined : baseVersion),
        body: JSON.stringify(scene),
    })
    if (putResponse.status === 409) {
        const conflict = await putResponse.json().catch(() => ({}))
        console.error(`Refusing to push: the destination moved to v${conflict.latestVersion ?? '?'} while this ran.`)
        console.error(`Pull first: node scripts/space-pull.mjs ${spaceId} --from ${toBase}`)
        process.exitCode = 1
        return
    }
    if (!putResponse.ok) {
        const text = await putResponse.text().catch(() => '')
        throw new Error(`HTTP ${putResponse.status} from ${livePutUrl}: ${text.slice(0, 200)}`)
    }
    console.log(`  ok — scene pushed to live`)
    console.log(`\nLive: https://di-studio.xyz/${spaceId}/`)
}

// Only run when invoked as a script, so the guard above can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exitCode = 1
    })
}
