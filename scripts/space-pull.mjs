/**
 * space-pull.mjs — pull a space from the live server into the local dev server.
 *
 * Usage:
 *   node scripts/space-pull.mjs <spaceId> [options]
 *
 * Options:
 *   --from   <url>    Live server API base (default: $LIVE_API_URL or https://di-studio.xyz/serverXR)
 *   --to     <url>    Local server API base (default: $LOCAL_API_URL or http://localhost:4000/serverXR)
 *   --token  <token>  Bearer token for the live server (default: $LIVE_API_TOKEN)
 *   --assets          Also download missing asset files via sync-space-assets logic
 *   --dry-run         Print what would happen without making changes
 *
 * After pulling, run:
 *   npm run sync:space-assets -- --space <spaceId> --base-url <liveUrl>/api/spaces/<spaceId>/assets
 * …to also fetch asset binaries from the live server.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

const parseArgs = (argv) => {
    const args = {
        spaceId: null,
        from: null,
        to: null,
        token: null,
        assets: false,
        dryRun: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            if (!args.spaceId) args.spaceId = arg
            continue
        }
        if (arg === '--from') { args.from = argv[++i]; continue }
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--assets') { args.assets = true; continue }
        if (arg === '--dry-run') { args.dryRun = true; continue }
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
            if (key) env[key] = value
        }
        return env
    } catch {
        return {}
    }
}

const buildHeaders = (token) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
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
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))

    if (!args.spaceId) {
        console.error('Usage: node scripts/space-pull.mjs <spaceId> [--from <url>] [--to <url>] [--token <token>] [--assets] [--dry-run]')
        process.exitCode = 1
        return
    }

    const fromBase = (args.from || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const toBase = (args.to || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const { spaceId, dryRun, assets } = args

    console.log(`[space-pull] ${spaceId}`)
    console.log(`  from: ${fromBase}`)
    console.log(`  to:   ${toBase}`)
    if (dryRun) console.log('  dry-run: no changes will be made')

    // 1. Fetch scene from live
    const sceneUrl = `${fromBase}/api/spaces/${spaceId}/scene`
    console.log(`\nFetching scene from ${sceneUrl}`)
    const { scene } = await apiFetch(sceneUrl, { headers: buildHeaders(token) })

    if (dryRun) {
        const objCount = Array.isArray(scene?.objects) ? scene.objects.length : 0
        const assetCount = Array.isArray(scene?.assets) ? scene.assets.length : 0
        console.log(`  scene has ${objCount} objects, ${assetCount} assets`)
        console.log('dry-run: skipping write')
        return
    }

    // 2. Write to spaces/{spaceId}/scene.json (git-tracked source of truth)
    const trackedScenePath = path.join(ROOT_DIR, 'spaces', spaceId, 'scene.json')
    await fs.mkdir(path.dirname(trackedScenePath), { recursive: true })
    await fs.writeFile(trackedScenePath, JSON.stringify(scene, null, 2) + '\n', 'utf8')
    console.log(`  saved to spaces/${spaceId}/scene.json  (commit this to share with co-creator)`)

    // 3. Also load into local dev server (or write directly to data dir if server not running)
    const localPutUrl = `${toBase}/api/spaces/${spaceId}/scene`
    console.log(`Registering with local dev server at ${localPutUrl}`)
    try {
        await apiFetch(localPutUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(scene),
        })
        console.log(`  ok — space "${spaceId}" registered in local DB`)
    } catch (apiError) {
        if (!apiError.message?.includes('fetch failed') && !apiError.message?.includes('ECONNREFUSED')) {
            throw apiError
        }
        // Local server not running — write to data dir directly.
        const dataSpaceDir = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces', spaceId)
        await fs.mkdir(path.join(dataSpaceDir, 'assets'), { recursive: true })
        await fs.writeFile(path.join(dataSpaceDir, 'scene.json'), JSON.stringify(scene, null, 2) + '\n', 'utf8')
        console.log(`  local server offline — written to serverXR/data/spaces/${spaceId}/scene.json`)
        console.log(`  start npm run dev to fully register in DB`)
    }

    // 3. Optionally download asset binaries
    if (assets) {
        const syncScript = path.join(ROOT_DIR, 'scripts', 'sync-space-assets.mjs')
        const assetBaseUrl = `${fromBase}/api/spaces/${spaceId}/assets`
        console.log(`\nDownloading assets from ${assetBaseUrl}`)
        execFileSync(process.execPath, [syncScript, '--space', spaceId, '--base-url', assetBaseUrl], {
            stdio: 'inherit',
            cwd: ROOT_DIR,
        })
    } else {
        console.log(`\nTip: to also download asset files run:`)
        console.log(`  npm run space:pull:assets -- ${spaceId}`)
        console.log(`  # or: npm run sync:space-assets -- --space ${spaceId} --base-url ${fromBase}/api/spaces/${spaceId}/assets`)
    }

    console.log(`\nDone. Open http://localhost:5173/${spaceId} to continue working.`)
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
