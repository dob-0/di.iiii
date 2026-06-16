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
 *
 * Set LIVE_API_TOKEN in .env.local (never commit it):
 *   echo 'LIVE_API_TOKEN=your-editor-token' >> .env.local
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

const parseArgs = (argv) => {
    const args = { spaceId: null, from: null, to: null, token: null, dryRun: false }
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
        console.error('Usage: node scripts/space-push.mjs <spaceId> [--to <url>] [--token <token>] [--dry-run]')
        process.exitCode = 1
        return
    }

    const fromBase = (args.from || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const toBase = (args.to || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const { spaceId, dryRun } = args

    if (!token) {
        console.error('Error: LIVE_API_TOKEN is required to push to the live server.')
        console.error('Add it to .env.local:  LIVE_API_TOKEN=your-editor-token')
        process.exitCode = 1
        return
    }

    // 1. Read scene — prefer git-tracked file, fall back to local API
    let scene
    const trackedScenePath = path.join(ROOT_DIR, 'spaces', spaceId, 'scene.json')
    console.log(`[space-push] ${spaceId}`)
    try {
        const raw = await fs.readFile(trackedScenePath, 'utf8')
        scene = JSON.parse(raw)
        console.log(`  source: spaces/${spaceId}/scene.json  (git-tracked)`)
    } catch {
        console.log(`  spaces/${spaceId}/scene.json not found, fetching from local server`)
        const localSceneUrl = `${fromBase}/api/spaces/${spaceId}/scene`
        const result = await apiFetch(localSceneUrl)
        scene = result.scene
        console.log(`  source: ${localSceneUrl}`)
    }
    const objCount = Array.isArray(scene?.objects) ? scene.objects.length : 0
    const assetCount = Array.isArray(scene?.assets) ? scene.assets.length : 0
    console.log(`  to:     ${toBase}`)
    console.log(`  scene:  ${objCount} objects, ${assetCount} assets`)

    if (dryRun) {
        console.log('dry-run: skipping push')
        return
    }

    // 2. Push scene to live
    const livePutUrl = `${toBase}/api/spaces/${spaceId}/scene`
    console.log(`Pushing scene to ${livePutUrl}`)
    await apiFetch(livePutUrl, {
        method: 'PUT',
        headers: buildHeaders(token),
        body: JSON.stringify(scene),
    })
    console.log(`  ok — scene pushed to live`)
    console.log(`\nLive: https://di-studio.xyz/${spaceId}/`)
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
