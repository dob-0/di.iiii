/**
 * space-code-push.mjs — sync spaces/{spaceId}/code/ files into the live space's project codeFiles.
 *
 * Usage:
 *   node scripts/space-code-push.mjs <spaceId> [--to <url>] [--token <token>] [--dry-run]
 *
 * Reads:   spaces/{spaceId}/code/** (html, css, js, ts, json, svg, txt, md)
 * Finds:   live space's publishedProjectId (or first project if unset)
 * Patches: PATCH {LIVE_API_URL}/api/projects/{projectId}/document
 *          sets presentationState.codeFiles and presentationState.mode = 'code'
 *
 * Requires LIVE_API_URL and LIVE_API_TOKEN in serverXR/.env.local.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'

const CODE_EXTENSIONS = new Set(['.html', '.css', '.js', '.ts', '.json', '.svg', '.txt', '.md'])

const parseArgs = (argv) => {
    const args = { spaceId: null, to: null, token: null, dryRun: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            if (!args.spaceId) args.spaceId = arg
            continue
        }
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
    const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
}

const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, options)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}: ${body?.error || JSON.stringify(body).slice(0, 200)}`)
    }
    return body
}

const readCodeFiles = async (codeDir) => {
    const entries = await fs.readdir(codeDir, { withFileTypes: true }).catch(() => [])
    const files = []
    for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (!CODE_EXTENSIONS.has(ext)) continue
        const content = await fs.readFile(path.join(codeDir, entry.name), 'utf8')
        files.push({ name: entry.name, content })
    }
    return files
}

const main = async () => {
    const localEnv = {
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))

    if (!args.spaceId) {
        console.error('Usage: node scripts/space-code-push.mjs <spaceId> [--to <url>] [--token <token>] [--dry-run]')
        process.exitCode = 1
        return
    }

    const liveBase = (args.to || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const { spaceId, dryRun } = args

    if (!token) {
        console.error('Error: LIVE_API_TOKEN is required.')
        console.error('  Add to serverXR/.env.local:  LIVE_API_TOKEN=your-admin-token')
        process.exitCode = 1
        return
    }

    const codeDir = path.join(ROOT_DIR, 'spaces', spaceId, 'code')

    let codeFiles
    try {
        await fs.access(codeDir)
        codeFiles = await readCodeFiles(codeDir)
    } catch {
        console.error(`No code directory found at spaces/${spaceId}/code/`)
        process.exitCode = 1
        return
    }

    if (!codeFiles.length) {
        console.log(`spaces/${spaceId}/code/ is empty — nothing to push.`)
        return
    }

    console.log(`[space-code-push] ${spaceId}`)
    console.log(`  live: ${liveBase}`)
    console.log(`  files: ${codeFiles.map(f => f.name).join(', ')}`)
    if (dryRun) { console.log('  dry-run: no changes'); return }

    // Find the target project (publishedProjectId or first project)
    const { space } = await apiFetch(`${liveBase}/api/spaces/${spaceId}`, {
        headers: buildHeaders(token),
    })

    let projectId = space?.publishedProjectId
    if (!projectId) {
        const { projects } = await apiFetch(`${liveBase}/api/spaces/${spaceId}/projects`, {
            headers: buildHeaders(token),
        }).catch(() => ({ projects: [] }))
        projectId = projects?.[0]?.id
    }

    if (!projectId) {
        console.error(`No project found in space "${spaceId}". Create one first.`)
        process.exitCode = 1
        return
    }

    console.log(`  project: ${projectId}`)

    // Read existing document to merge presentationState
    const { document: doc } = await apiFetch(`${liveBase}/api/projects/${projectId}/document`, {
        headers: buildHeaders(token),
    })

    const updated = {
        ...doc,
        presentationState: {
            ...(doc?.presentationState || {}),
            mode: 'code',
            codeFiles,
        },
    }

    await apiFetch(`${liveBase}/api/projects/${projectId}/document`, {
        method: 'PATCH',
        headers: buildHeaders(token),
        body: JSON.stringify(updated),
    })

    console.log(`  ok — ${codeFiles.length} file(s) pushed to ${projectId}`)
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
