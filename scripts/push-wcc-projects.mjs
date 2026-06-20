#!/usr/bin/env node
/**
 * push-wcc-projects.mjs — push WCC project assets + documents to a live server.
 *
 * For each WCC artist project:
 *   1. Upload any local assets not yet on the remote server (by SHA256 ID)
 *   2. PUT the local document.json to the remote server
 *
 * Usage:
 *   node scripts/push-wcc-projects.mjs [options]
 *
 * Options:
 *   --to     <url>    Live server API base (default: $LIVE_API_URL or https://di-studio.xyz/serverXR)
 *   --token  <token>  Bearer token (default: $LIVE_API_TOKEN)
 *   --space  <id>     Space ID (default: wcc)
 *   --project <id>    Only push this one project
 *   --assets-only     Skip document push, only upload missing assets
 *   --docs-only       Skip asset upload, only push documents
 *   --dry-run         Print what would happen, make no changes
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_STAGING_URL = 'https://staging.di-studio.xyz/serverXR'

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null }

const DRY_RUN = flag('dry-run')
const SPACE_ID = opt('space') || 'wcc'
const PROJECT_FILTER = opt('project')
const ASSETS_ONLY = flag('assets-only')
const DOCS_ONLY = flag('docs-only')

// ── Env loading ───────────────────────────────────────────────────────────────
function loadEnv(filePath) {
    try {
        return Object.fromEntries(
            fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
                .filter(l => l && !l.startsWith('#') && l.includes('='))
                .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] })
        )
    } catch { return {} }
}

const localEnv = {
    ...loadEnv(path.join(ROOT_DIR, 'serverXR', '.env')),
    ...loadEnv(path.join(ROOT_DIR, 'serverXR', '.env.local')),
}
const getEnv = (k) => process.env[k] || localEnv[k] || ''

const BASE_URL = (opt('to') || getEnv('LIVE_API_URL') || DEFAULT_STAGING_URL).replace(/\/+$/, '')
const TOKEN = opt('token') || getEnv('LIVE_API_TOKEN') || ''

const WCC_PROJECTS_DIR = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces', SPACE_ID, 'projects')

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function authHeaders(extra = {}) {
    return { Authorization: TOKEN ? `Bearer ${TOKEN}` : '', ...extra }
}

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts)
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${url}: ${body.slice(0, 200)}`)
    }
    return res.json()
}

// Check if an asset exists on the remote server
async function remoteHasAsset(projectId, assetId) {
    try {
        const res = await fetch(`${BASE_URL}/api/projects/${projectId}/assets/${assetId}`, {
            method: 'HEAD',
            headers: authHeaders()
        })
        return res.ok
    } catch {
        return false
    }
}

// Upload a binary asset via multipart form
async function uploadAsset(projectId, assetId, assetPath, meta) {
    const buf = await fsp.readFile(assetPath)
    const formData = new FormData()
    formData.append('assetId', assetId)
    formData.append('asset', new Blob([buf], { type: meta.mimeType || 'application/octet-stream' }), meta.name)

    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/assets`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Upload failed HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json()
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    if (!TOKEN) {
        console.error('Error: LIVE_API_TOKEN not set. Add to serverXR/.env.local')
        process.exitCode = 1
        return
    }

    console.log(`[push-wcc-projects] space=${SPACE_ID} → ${BASE_URL}`)
    if (DRY_RUN) console.log('[dry-run] No changes will be made.\n')

    const projectDirs = fs.readdirSync(WCC_PROJECTS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(WCC_PROJECTS_DIR, e.name))
        .filter(d => !PROJECT_FILTER || path.basename(d) === PROJECT_FILTER)

    for (const projectDir of projectDirs) {
        const projectId = path.basename(projectDir)
        const assetsDir = path.join(projectDir, 'assets')
        const docPath = path.join(projectDir, 'document.json')

        console.log(`\n── ${projectId} ──`)

        // Push assets
        if (!DOCS_ONLY && fs.existsSync(assetsDir)) {
            const assetFiles = fs.readdirSync(assetsDir).filter(f => !f.endsWith('.json'))
            for (const assetFile of assetFiles) {
                const assetPath = path.join(assetsDir, assetFile)
                const metaPath = assetPath + '.json'
                if (!fs.existsSync(metaPath)) continue

                const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
                const assetId = meta.id || assetFile
                const sizeMB = (meta.size / 1024 / 1024).toFixed(2)

                if (DRY_RUN) {
                    console.log(`  [asset] would upload ${meta.name} (${sizeMB} MB)`)
                    continue
                }

                const exists = await remoteHasAsset(projectId, assetId)
                if (exists) {
                    console.log(`  [asset] ${meta.name} (${sizeMB} MB) — already on remote, skip`)
                    continue
                }

                process.stdout.write(`  [asset] uploading ${meta.name} (${sizeMB} MB)...`)
                try {
                    await uploadAsset(projectId, assetId, assetPath, meta)
                    console.log(' ✓')
                } catch (err) {
                    console.log(` FAILED: ${err.message}`)
                }
            }
        }

        // Push document
        if (!ASSETS_ONLY && fs.existsSync(docPath)) {
            const doc = JSON.parse(await fsp.readFile(docPath, 'utf8'))

            if (DRY_RUN) {
                console.log(`  [doc] would PUT document.json`)
                continue
            }

            process.stdout.write(`  [doc] pushing document.json...`)
            try {
                await apiFetch(`${BASE_URL}/api/projects/${projectId}/document`, {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(doc),
                })
                console.log(' ✓')
            } catch (err) {
                console.log(` FAILED: ${err.message}`)
            }
        }
    }

    console.log('\n[done]')
}

main().catch(err => {
    console.error('Fatal:', err)
    process.exitCode = 1
})
