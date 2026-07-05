#!/usr/bin/env node
/**
 * promote-wcc-projects.mjs — copy WCC project documents (+ referenced assets)
 * from one live environment to another, e.g. staging → prod.
 *
 * Zone/portal positions are authored inside a project's document (entity
 * transforms) — there is no promotion path between environments other than
 * this script, so staging edits stay on staging until this is run.
 *
 * Usage:
 *   node scripts/promote-wcc-projects.mjs [options]
 *
 * Options:
 *   --space   <id>     Space ID (default: wcc)
 *   --project <id>     Only promote this one project
 *   --from    <url>    Source API base (default: $LIVE_API_URL — staging)
 *   --to      <url>    Destination API base (default: $PROD_API_URL)
 *   --from-token <tok> Bearer token for --from (default: $LIVE_API_TOKEN)
 *   --to-token   <tok> Bearer token for --to (default: $PROD_API_TOKEN)
 *   --assets-only      Skip document push, only upload missing assets
 *   --docs-only        Skip asset upload, only push documents
 *   --dry-run          Print what would happen, make no changes
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null }

const DRY_RUN = flag('dry-run')
const SPACE_ID = opt('space') || 'wcc'
const PROJECT_FILTER = opt('project')
const ASSETS_ONLY = flag('assets-only')
const DOCS_ONLY = flag('docs-only')

function loadEnv(filePath) {
    try {
        return Object.fromEntries(
            fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
                .filter(l => l && !l.startsWith('#') && l.includes('='))
                .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] })
        )
    } catch { return {} }
}

const localEnv = {
    ...loadEnv(path.join(ROOT_DIR, 'serverXR', '.env')),
    ...loadEnv(path.join(ROOT_DIR, 'serverXR', '.env.local')),
}
const getEnv = (k) => process.env[k] || localEnv[k] || ''

const FROM_URL = (opt('from') || getEnv('LIVE_API_URL') || '').replace(/\/+$/, '')
const TO_URL = (opt('to') || getEnv('PROD_API_URL') || '').replace(/\/+$/, '')
const FROM_TOKEN = opt('from-token') || getEnv('LIVE_API_TOKEN') || ''
const TO_TOKEN = opt('to-token') || getEnv('PROD_API_TOKEN') || ''

function authHeaders(token, extra = {}) {
    return { Authorization: token ? `Bearer ${token}` : '', ...extra }
}

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts)
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${url}: ${body.slice(0, 200)}`)
    }
    return res.json()
}

async function remoteHasAsset(base, token, projectId, assetId) {
    try {
        const res = await fetch(`${base}/api/projects/${projectId}/assets/${assetId}`, {
            method: 'HEAD',
            headers: authHeaders(token)
        })
        return res.ok
    } catch {
        return false
    }
}

async function copyAsset(projectId, asset) {
    const assetId = asset.id || asset.assetId
    const download = await fetch(`${FROM_URL}/api/projects/${projectId}/assets/${assetId}`, {
        headers: authHeaders(FROM_TOKEN)
    })
    if (!download.ok) throw new Error(`download failed HTTP ${download.status}`)
    const buf = Buffer.from(await download.arrayBuffer())
    const mimeType = download.headers.get('content-type') || asset.mimeType || 'application/octet-stream'

    const formData = new FormData()
    formData.append('assetId', assetId)
    formData.append('asset', new Blob([buf], { type: mimeType }), asset.name || assetId)

    const res = await fetch(`${TO_URL}/api/projects/${projectId}/assets`, {
        method: 'POST',
        headers: authHeaders(TO_TOKEN),
        body: formData,
    })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`upload failed HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json()
}

async function main() {
    if (!FROM_URL || !TO_URL) {
        console.error('Error: --from/--to (or LIVE_API_URL/PROD_API_URL) required.')
        process.exitCode = 1; return
    }
    if (!FROM_TOKEN || !TO_TOKEN) {
        console.error('Error: --from-token/--to-token (or LIVE_API_TOKEN/PROD_API_TOKEN) required.')
        process.exitCode = 1; return
    }

    console.log(`[promote-wcc-projects] space=${SPACE_ID}  ${FROM_URL} → ${TO_URL}`)
    if (DRY_RUN) console.log('[dry-run] No changes will be made.\n')

    const { projects = [] } = await apiFetch(`${FROM_URL}/api/spaces/${SPACE_ID}/projects`, { headers: authHeaders(FROM_TOKEN) })
    const targets = projects.filter(p => !PROJECT_FILTER || p.id === PROJECT_FILTER)
    if (!targets.length) {
        console.log(PROJECT_FILTER ? `No project "${PROJECT_FILTER}" found on source.` : 'No projects found on source.')
        return
    }

    for (const { id: projectId } of targets) {
        console.log(`\n── ${projectId} ──`)
        const { document: doc } = await apiFetch(`${FROM_URL}/api/projects/${projectId}/document`, { headers: authHeaders(FROM_TOKEN) })

        if (!DOCS_ONLY) {
            for (const asset of doc.assets || []) {
                const assetId = asset.id || asset.assetId
                if (!assetId) continue
                const exists = await remoteHasAsset(TO_URL, TO_TOKEN, projectId, assetId)
                if (exists) { console.log(`  [asset] ${asset.name || assetId} — already on destination, skip`); continue }
                if (DRY_RUN) { console.log(`  [asset] would copy ${asset.name || assetId} to destination`); continue }
                process.stdout.write(`  [asset] copying ${asset.name || assetId}...`)
                try { await copyAsset(projectId, asset); console.log(' ✓') }
                catch (err) { console.log(` FAILED: ${err.message}`) }
            }
        }

        if (!ASSETS_ONLY) {
            if (DRY_RUN) { console.log('  [doc] would PUT document (entity/zone positions included)'); continue }
            process.stdout.write('  [doc] pushing document...')
            try {
                await apiFetch(`${TO_URL}/api/projects/${projectId}/document`, {
                    method: 'PUT',
                    headers: authHeaders(TO_TOKEN, { 'Content-Type': 'application/json' }),
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
