/**
 * space-new.mjs — create a new space on the live server and pull it locally.
 *
 * Usage:
 *   node scripts/space-new.mjs <spaceId> [options]
 *
 * Options:
 *   --label  <text>   Human-readable name for the space (default: spaceId)
 *   --to     <url>    Live server API base (default: $LIVE_API_URL or https://di-studio.xyz/serverXR)
 *   --local  <url>    Local server API base (default: $LOCAL_API_URL or http://localhost:4000/serverXR)
 *   --token  <token>  Admin token for the live server (default: $LIVE_API_TOKEN)
 *   --local-only      Only create the space locally (skip live server)
 *   --dry-run         Print what would happen without making changes
 *
 * Requires LIVE_API_TOKEN in .env.local (admin role) to create on the live server.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

const parseArgs = (argv) => {
    const args = { spaceId: null, label: null, to: null, local: null, token: null, localOnly: false, dryRun: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            if (!args.spaceId) args.spaceId = arg
            continue
        }
        if (arg === '--label') { args.label = argv[++i]; continue }
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--local') { args.local = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--local-only') { args.localOnly = true; continue }
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
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}: ${body?.error || JSON.stringify(body).slice(0, 200)}`)
    }
    return body
}

const BLANK_SCENE = { version: 1, objects: [], assets: [] }

const main = async () => {
    const localEnv = {
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))

    if (!args.spaceId) {
        console.error('Usage: node scripts/space-new.mjs <spaceId> [--label <text>] [--to <url>] [--local <url>] [--token <token>] [--local-only] [--dry-run]')
        console.error()
        console.error('Examples:')
        console.error('  node scripts/space-new.mjs n001 --label "Jam Session 2"')
        console.error('  node scripts/space-new.mjs test --local-only')
        process.exitCode = 1
        return
    }

    const liveBase = (args.to || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const localBase = (args.local || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const { spaceId, dryRun, localOnly } = args
    const label = args.label || spaceId

    const liveHost = liveBase.replace(/\/serverXR.*/, '')

    console.log(`[space-new] ${spaceId} (${label})`)
    if (localOnly) {
        console.log('  scope: local only')
    } else {
        console.log(`  live:  ${liveBase}`)
        console.log(`  local: ${localBase}`)
    }
    if (dryRun) console.log('  dry-run: no changes will be made')
    console.log()

    if (!localOnly && !token) {
        console.error('Error: LIVE_API_TOKEN is required to create a space on the live server.')
        console.error('  Add to .env.local:  LIVE_API_TOKEN=your-admin-token')
        console.error('  Or create the space in the browser and use space:pull instead:')
        console.error(`  Open ${liveHost}/${spaceId} in the browser, then run:`)
        console.error(`    npm run space:pull -- ${spaceId}`)
        process.exitCode = 1
        return
    }

    let scene = BLANK_SCENE

    // 1. Create on live server
    if (!localOnly) {
        if (dryRun) {
            console.log(`Would POST ${liveBase}/api/spaces  {id: "${spaceId}", label: "${label}"}`)
        } else {
            console.log(`Creating space on live server...`)
            try {
                const result = await apiFetch(`${liveBase}/api/spaces`, {
                    method: 'POST',
                    headers: buildHeaders(token),
                    body: JSON.stringify({ id: spaceId, label }),
                })
                console.log(`  ok — space "${result.space?.id || spaceId}" created on live`)
            } catch (error) {
                if (error.message?.includes('409') || error.message?.toLowerCase().includes('already exists')) {
                    console.log(`  space already exists on live, fetching its scene instead`)
                    try {
                        const { scene: liveScene } = await apiFetch(`${liveBase}/api/spaces/${spaceId}/scene`, {
                            headers: buildHeaders(token),
                        })
                        scene = liveScene || BLANK_SCENE
                        console.log(`  fetched existing scene (${Array.isArray(scene?.objects) ? scene.objects.length : 0} objects)`)
                    } catch {
                        // Leave blank scene as fallback
                    }
                } else {
                    throw error
                }
            }
        }
    }

    // 2. Write to git-tracked spaces/ dir and register with local server
    if (dryRun) {
        console.log(`Would write spaces/${spaceId}/scene.json`)
        console.log(`Would PUT ${localBase}/api/spaces/${spaceId}/scene`)
    } else {
        // Write git-tracked copy
        const trackedPath = path.join(ROOT_DIR, 'spaces', spaceId, 'scene.json')
        await fs.mkdir(path.dirname(trackedPath), { recursive: true })
        await fs.writeFile(trackedPath, JSON.stringify(scene, null, 2) + '\n', 'utf8')
        console.log(`  saved to spaces/${spaceId}/scene.json  (commit this to share with co-creator)`)

        // Register with local server (or write to data dir if offline)
        console.log(`Registering with local dev server...`)
        try {
            await apiFetch(`${localBase}/api/spaces/${spaceId}/scene`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(scene),
            })
            console.log(`  ok — space registered in local server DB`)
        } catch (error) {
            if (!error.message?.includes('fetch failed') && !error.message?.includes('ECONNREFUSED')) {
                throw error
            }
            console.log(`  local server offline — writing to serverXR/data/spaces/ directly`)
            const dataDir = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces', spaceId)
            await fs.mkdir(path.join(dataDir, 'assets'), { recursive: true })
            await fs.writeFile(path.join(dataDir, 'scene.json'), JSON.stringify(scene, null, 2) + '\n', 'utf8')
            console.log(`  start npm run dev to fully register in DB`)
        }
    }

    console.log()
    console.log('Ready.')
    if (!localOnly && !dryRun) {
        console.log(`  Live:  ${liveHost}/${spaceId}/`)
    }
    console.log(`  Local: http://localhost:5173/${spaceId}`)
    console.log()
    console.log('Next steps:')
    console.log(`  Develop locally → npm run space:push -- ${spaceId}  (sync to live)`)
    console.log(`  Get latest live → npm run space:pull -- ${spaceId}`)
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
