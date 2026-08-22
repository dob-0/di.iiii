/**
 * project-pull.mjs — pull a published project from the live server into the
 * local dev server.
 *
 * `space-pull.mjs` transports the legacy per-space `scene.json` only. Every
 * surface that actually renders 3D — the landing hero background
 * (`GridFloorBackground` → `LiveProjectScene`), the public space viewer, the
 * exhibition routes — reads a *project* document instead, so a fresh clone
 * with an empty DB shows a black void even after a successful space-pull.
 * This script moves that missing half.
 *
 * Usage:
 *   node scripts/project-pull.mjs <projectId> [options]
 *
 * Options:
 *   --space   <id>    Target local space (default: the project's own spaceId on live)
 *   --from    <url>   Live server API base (default: $LIVE_API_URL or https://di-studio.xyz/serverXR)
 *   --to      <url>   Local server API base (default: $LOCAL_API_URL or http://localhost:4000/serverXR)
 *   --token   <token> Bearer token for the live server (default: $LIVE_API_TOKEN).
 *                     Public projects need none.
 *   --to-token <token> Bearer token for the LOCAL server (default: $API_TOKEN,
 *                     read from serverXR/.env.local). Required whenever the
 *                     local server runs with REQUIRE_AUTH=true — without it
 *                     every write below returns 401.
 *   --publish         Point the target space's publishedProjectId at this project
 *                     (what makes the landing background and space viewer render it)
 *   --no-assets       Skip asset binaries — document only
 *   --force           Overwrite the document if the project already exists locally
 *   --dry-run         Print what would happen without making changes
 *
 * Example — restore the landing page's 3D background on a fresh clone:
 *   node scripts/project-pull.mjs main-dii-project --publish
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

const parseArgs = (argv) => {
    const args = {
        projectId: null,
        space: null,
        from: null,
        to: null,
        token: null,
        toToken: null,
        publish: false,
        assets: true,
        force: false,
        dryRun: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            if (!args.projectId) args.projectId = arg
            continue
        }
        if (arg === '--space') { args.space = argv[++i]; continue }
        if (arg === '--from') { args.from = argv[++i]; continue }
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--to-token') { args.toToken = argv[++i]; continue }
        if (arg === '--publish') { args.publish = true; continue }
        if (arg === '--no-assets') { args.assets = false; continue }
        if (arg === '--force') { args.force = true; continue }
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
            // An empty assignment is a placeholder, not a value: the root .env
            // holds `LIVE_API_TOKEN=` with nothing after it and is merged last,
            // which would blank the real token from serverXR/.env.local.
            if (key && value) env[key] = value
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

// Every request gets a deadline. Without one a single stalled socket to the
// live server hangs the whole pull indefinitely with no output — asset
// transfers are long enough that a silent stall is otherwise indistinguishable
// from slow progress.
const REQUEST_TIMEOUT_MS = 30000
const TRANSFER_TIMEOUT_MS = 180000
const MAX_ATTEMPTS = 3

const fetchWithTimeout = (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) =>
    fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })

// Retries transient network faults (stalled socket, reset connection). HTTP
// error *responses* are returned as-is — only the caller knows whether a 404
// is fatal or expected.
const fetchWithRetry = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS, label = '') => {
    let lastError = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await fetchWithTimeout(url, options, timeoutMs)
        } catch (error) {
            lastError = error
            if (attempt < MAX_ATTEMPTS) {
                console.log(`    ${label || url} — attempt ${attempt} failed (${error?.name || 'error'}), retrying`)
            }
        }
    }
    throw lastError
}

const apiFetch = async (url, options = {}) => {
    const response = await fetchWithRetry(url, options)
    if (!response.ok) {
        const text = await response.text().catch(() => '')
        const error = new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`)
        error.status = response.status
        throw error
    }
    return response.json()
}

// Resolves to null on 404 instead of throwing — callers use this to branch on
// "does this already exist" without treating an expected miss as a failure.
const apiFetchOptional = async (url, options = {}) => {
    try {
        return await apiFetch(url, options)
    } catch (error) {
        if (error.status === 404) return null
        throw error
    }
}

const main = async () => {
    // serverXR/.env.local is where the local server's own API_TOKEN lives; the
    // root files carry the live-tier settings only.
    const localEnv = {
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))

    if (!args.projectId) {
        console.error('Usage: node scripts/project-pull.mjs <projectId> [--space <id>] [--from <url>] [--to <url>] [--token <token>] [--to-token <token>] [--publish] [--no-assets] [--force] [--dry-run]')
        process.exitCode = 1
        return
    }

    const fromBase = (args.from || getEnv('LIVE_API_URL') || DEFAULT_LIVE_URL).replace(/\/+$/, '')
    const toBase = (args.to || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    const localToken = args.toToken || getEnv('API_TOKEN') || ''
    const { projectId, dryRun, force, publish } = args
    const localHeaders = () => buildHeaders(localToken)
    const localAuth = () => (localToken ? { Authorization: `Bearer ${localToken}` } : {})

    console.log(`[project-pull] ${projectId}`)
    console.log(`  from: ${fromBase}`)
    console.log(`  to:   ${toBase}`)
    if (dryRun) console.log('  dry-run: no changes will be made')

    // 1. Fetch the document from live. Public projects need no token.
    const documentUrl = `${fromBase}/api/projects/${projectId}/document`
    console.log(`\nFetching document from ${documentUrl}`)
    const remote = await apiFetch(documentUrl, { headers: buildHeaders(token) })
    const document = remote?.document
    if (!document) {
        throw new Error('Live response contained no document.')
    }

    const spaceId = args.space || document?.projectMeta?.spaceId || remote?.project?.spaceId
    if (!spaceId) {
        throw new Error('Could not determine a target space — pass --space <id>.')
    }
    const title = document?.projectMeta?.title || remote?.project?.title || projectId
    const assetList = Array.isArray(document.assets) ? document.assets : []
    const entityCount = Array.isArray(document.entities) ? document.entities.length : 0

    console.log(`  "${title}"`)
    console.log(`  space: ${spaceId} · ${entityCount} objects · ${assetList.length} assets`)

    if (dryRun) {
        console.log('dry-run: skipping write')
        return
    }

    // 2. The space has to exist locally before a project can live in it. A
    //    fresh clone bootstraps only "open" and "main", so anything else
    //    (wcc, beyond-form, …) has to be created here first.
    // Authenticated even though it only reads: a private space answers an
    // anonymous GET with 401, not 404, so without a token this cannot tell
    // "not here yet" from "here but not yours" and dies on the difference.
    const localSpace = await apiFetchOptional(`${toBase}/api/spaces/${spaceId}`, { headers: localHeaders() })
    if (!localSpace) {
        console.log(`\nSpace "${spaceId}" not present locally — creating it`)
        await apiFetch(`${toBase}/api/spaces`, {
            method: 'POST',
            headers: localHeaders(),
            body: JSON.stringify({ slug: spaceId, label: spaceId, permanent: true }),
        })
        console.log(`  created`)
    }

    // 3. Create the project shell. `slug` is what the server normalizes into
    //    the project id, so passing the source id keeps every asset URL inside
    //    the document (/api/projects/<id>/assets/<assetId>) valid as-is.
    console.log(`\nCreating project "${projectId}" in space "${spaceId}"`)
    try {
        await apiFetch(`${toBase}/api/spaces/${spaceId}/projects`, {
            method: 'POST',
            headers: localHeaders(),
            body: JSON.stringify({ slug: projectId, title }),
        })
        console.log('  created')
    } catch (error) {
        if (error.status !== 409) throw error
        if (!force) {
            throw new Error(`Project "${projectId}" already exists locally. Re-run with --force to overwrite its document.`)
        }
        console.log('  already exists — overwriting (--force)')
    }

    // 4. Load the document.
    console.log(`Writing document (${entityCount} objects)`)
    await apiFetch(`${toBase}/api/projects/${projectId}/document`, {
        method: 'PUT',
        headers: localHeaders(),
        body: JSON.stringify(document),
    })
    console.log('  ok')

    // 5. Asset binaries. Ids are preserved so the document's existing
    //    references resolve without rewriting; already-present assets are
    //    skipped so re-running is cheap.
    if (args.assets && assetList.length) {
        console.log(`\nSyncing ${assetList.length} assets`)
        let copied = 0
        let skipped = 0
        let failed = 0
        for (const [index, asset] of assetList.entries()) {
            const assetId = asset?.id
            if (!assetId) continue
            const label = `[${index + 1}/${assetList.length}] ${asset.name || assetId}`
            try {
                const existing = await apiFetchOptional(
                    `${toBase}/api/projects/${projectId}/assets/${assetId}/meta`,
                    { headers: localAuth() }
                )
                if (existing) {
                    skipped++
                    continue
                }
                const source = await fetchWithRetry(
                    `${fromBase}/api/projects/${projectId}/assets/${assetId}`,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
                    TRANSFER_TIMEOUT_MS,
                    label
                )
                if (!source.ok) {
                    console.log(`  ${label} — live returned HTTP ${source.status}, skipping`)
                    failed++
                    continue
                }
                const bytes = Buffer.from(await source.arrayBuffer())
                const form = new FormData()
                // assetId first: multer exposes text fields to the handler in
                // arrival order, and the route reads req.body.assetId while
                // streaming the file part.
                form.append('assetId', assetId)
                form.append('asset', new Blob([bytes], {
                    type: asset.mimeType || source.headers.get('content-type') || 'application/octet-stream',
                }), asset.name || assetId)
                const upload = await fetchWithRetry(
                    `${toBase}/api/projects/${projectId}/assets`,
                    { method: 'POST', body: form, headers: localAuth() },
                    TRANSFER_TIMEOUT_MS,
                    label
                )
                if (!upload.ok) {
                    const text = await upload.text().catch(() => '')
                    console.log(`  ${label} — local upload failed HTTP ${upload.status}: ${text.slice(0, 120)}`)
                    failed++
                    continue
                }
                copied++
                console.log(`  ${label} — ${bytes.length} bytes`)
            } catch (error) {
                console.log(`  ${label} — ${error?.message || error}`)
                failed++
            }
        }
        console.log(`  ${copied} copied, ${skipped} already present, ${failed} failed`)
    } else if (!args.assets) {
        console.log('\nSkipping assets (--no-assets)')
    }

    // 6. Publishing is what actually makes the scene visible: the landing
    //    background picks a space by `publishedProjectId`, and the public
    //    viewer renders that same project.
    if (publish) {
        console.log(`\nPublishing "${projectId}" as space "${spaceId}"'s scene`)
        await apiFetch(`${toBase}/api/spaces/${spaceId}`, {
            method: 'PATCH',
            headers: localHeaders(),
            body: JSON.stringify({ publishedProjectId: projectId }),
        })
        console.log('  ok')
    } else {
        console.log(`\nTip: re-run with --publish to make this the space's rendered scene.`)
    }

    console.log(`\nDone. Open http://localhost:5173/${spaceId} (or / for the landing background).`)
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
