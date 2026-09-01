/**
 * tier-sync.mjs — reconcile the projects of one tier against another.
 *
 * Every tier is its own database and nothing keeps them in step. `local:mirror`
 * fills the dev box FROM the live tiers; `project-pull` moves one project the
 * same way. Neither can move work the other direction, and the estate has now
 * drifted twice in a week: 74 br_id_ge projects that exist on one desktop and
 * nowhere else, 26 in `open`, four empty shells in `main` on three different
 * tiers. This is the missing half.
 *
 * It only ever ADDS. Nothing is deleted, nothing already at the destination is
 * touched unless `--force` is passed, and production is refused by default —
 * the same guard `space-push.mjs` carries, for the same reason.
 *
 * Usage:
 *   node scripts/tier-sync.mjs --from local --to staging [options]
 *
 * Options:
 *   --space <id>        Only this space (default: every space the source has)
 *   --no-assets         Documents only — faster, and leaves images unresolvable
 *   --force             Overwrite documents that already exist at the destination
 *   --dry-run           Print the plan and write nothing
 *   --allow-production  Required before anything may be written to di-studio.xyz
 *
 * Tokens come from serverXR/.env.local: API_TOKEN (local), LIVE_API_TOKEN
 * (staging), PROD_API_TOKEN (production).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 30000
const TRANSFER_TIMEOUT_MS = 120000

export const TIERS = {
    local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' },
    staging: { base: 'https://staging.di-studio.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' },
    prod: { base: 'https://di-studio.xyz/serverXR', tokenKey: 'PROD_API_TOKEN' }
}

// Production is the one host this script must never reach by inheritance.
export const isProductionTarget = (url) => {
    try {
        const { hostname } = new URL(url)
        return hostname === 'di-studio.xyz' || hostname === 'www.di-studio.xyz'
    } catch {
        return false
    }
}

// What has to move for `to` to hold everything `from` holds. Pure, so the plan
// can be read and asserted without a server in reach.
export const planSync = ({ source, destination, force = false }) => {
    const plan = []
    for (const [spaceId, sourceProjects] of Object.entries(source)) {
        const destProjects = destination[spaceId]
        if (!destProjects) {
            plan.push({ spaceId, createSpace: true, projects: [...sourceProjects] })
            continue
        }
        const missing = sourceProjects.filter((id) => !destProjects.includes(id))
        const overwrite = force ? sourceProjects.filter((id) => destProjects.includes(id)) : []
        if (missing.length || overwrite.length) {
            plan.push({ spaceId, createSpace: false, projects: [...missing, ...overwrite] })
        }
    }
    return plan
}

const readEnv = () => {
    const file = path.join(ROOT_DIR, 'serverXR', '.env.local')
    if (!fs.existsSync(file)) return {}
    return Object.fromEntries(
        fs.readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
            .map((line) => {
                const i = line.indexOf('=')
                return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
            })
    )
}

const parseArgs = (argv) => {
    const args = { from: null, to: null, space: null, assets: true, force: false, dryRun: false, allowProduction: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--from') args.from = argv[++i]
        else if (arg === '--to') args.to = argv[++i]
        else if (arg === '--space') args.space = argv[++i]
        else if (arg === '--no-assets') args.assets = false
        else if (arg === '--force') args.force = true
        else if (arg === '--dry-run') args.dryRun = true
        else if (arg === '--allow-production') args.allowProduction = true
    }
    return args
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (!TIERS[args.from] || !TIERS[args.to] || args.from === args.to) {
        console.error('usage: node scripts/tier-sync.mjs --from <local|staging|prod> --to <local|staging|prod>')
        process.exit(1)
    }

    const env = readEnv()
    const from = { ...TIERS[args.from], token: env[TIERS[args.from].tokenKey] }
    const to = { ...TIERS[args.to], token: env[TIERS[args.to].tokenKey] }

    if (isProductionTarget(to.base) && !args.allowProduction) {
        console.error('refused: production is the destination. Re-run with --allow-production if that is really what you mean.')
        process.exit(1)
    }

    const call = async (tier, pathname, options = {}, timeout = TIMEOUT_MS) => fetch(tier.base + pathname, {
        ...options,
        headers: {
            ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
            ...(tier.token ? { Authorization: `Bearer ${tier.token}` } : {}),
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(timeout)
    })

    const listSpaces = async (tier) => {
        const res = await call(tier, '/api/spaces')
        if (!res.ok) throw new Error(`${tier.base} /api/spaces → HTTP ${res.status}`)
        const body = await res.json()
        return (body.spaces || body || []).map((s) => s.id)
    }

    const listProjects = async (tier, spaceId) => {
        const res = await call(tier, `/api/spaces/${spaceId}/projects`)
        if (!res.ok) return []
        const body = await res.json()
        return (body.projects || body || []).map((p) => p.id)
    }

    const readInventory = async (tier, only) => {
        const spaces = (await listSpaces(tier)).filter((id) => !only || id === only)
        const inventory = {}
        for (const spaceId of spaces) inventory[spaceId] = await listProjects(tier, spaceId)
        return inventory
    }

    console.log(`tier-sync  ${args.from} → ${args.to}${args.dryRun ? '  (dry run)' : ''}`)
    const source = await readInventory(from, args.space)
    const destination = await readInventory(to, args.space)
    const plan = planSync({ source, destination, force: args.force })

    if (!plan.length) {
        console.log('\nnothing to move — the destination already holds everything the source has.')
        return
    }

    let projectCount = 0
    console.log('')
    for (const item of plan) {
        projectCount += item.projects.length
        console.log(`── ${item.spaceId}${item.createSpace ? '  (space missing — will be created)' : ''}`)
        item.projects.forEach((id) => console.log(`   · ${id}`))
    }
    console.log(`\n${plan.length} space(s), ${projectCount} project(s) to copy`)
    if (args.dryRun) {
        console.log('\ndry-run: nothing was written')
        return
    }

    let copied = 0
    let failed = 0
    for (const item of plan) {
        if (item.createSpace) {
            const res = await call(to, '/api/spaces', {
                method: 'POST',
                body: JSON.stringify({ slug: item.spaceId, label: item.spaceId, permanent: true })
            })
            console.log(`\n${item.spaceId}: space ${res.ok ? 'created' : `NOT created (HTTP ${res.status})`}`)
        }

        for (const projectId of item.projects) {
            try {
                const docRes = await call(from, `/api/projects/${projectId}/document`, {}, TRANSFER_TIMEOUT_MS)
                if (!docRes.ok) throw new Error(`source document HTTP ${docRes.status}`)
                const body = await docRes.json()
                const document = body.document || body
                const title = document?.projectMeta?.title || projectId

                const create = await call(to, `/api/spaces/${item.spaceId}/projects`, {
                    method: 'POST',
                    body: JSON.stringify({ slug: projectId, title })
                })
                if (!create.ok && create.status !== 409) throw new Error(`create HTTP ${create.status}`)

                const put = await call(to, `/api/projects/${projectId}/document`, {
                    method: 'PUT',
                    body: JSON.stringify(document)
                }, TRANSFER_TIMEOUT_MS)
                if (!put.ok) throw new Error(`document HTTP ${put.status}`)

                let assetNote = ''
                if (args.assets) {
                    const moved = await copyAssets({ call, from, to, projectId, document })
                    assetNote = moved ? `, ${moved} asset(s)` : ''
                }
                copied++
                console.log(`  ✓ ${item.spaceId}/${projectId}${assetNote}`)
            } catch (error) {
                failed++
                console.log(`  ✗ ${item.spaceId}/${projectId} — ${error.message}`)
            }
        }
    }

    console.log(`\ncopied ${copied}, failed ${failed}`)
    if (failed) process.exitCode = 1
}

// Assets carry their ids across so the document's existing
// /api/projects/<id>/assets/<assetId> references resolve without rewriting.
const copyAssets = async ({ call, from, to, projectId, document }) => {
    const assets = Array.isArray(document?.assets) ? document.assets : []
    let moved = 0
    for (const asset of assets) {
        const assetId = asset?.id
        if (!assetId) continue
        const existing = await call(to, `/api/projects/${projectId}/assets/${assetId}/meta`)
        if (existing.ok) continue
        const source = await call(from, `/api/projects/${projectId}/assets/${assetId}`, {}, TRANSFER_TIMEOUT_MS)
        if (!source.ok) continue
        const bytes = Buffer.from(await source.arrayBuffer())
        const form = new FormData()
        // assetId first: multer exposes text fields in arrival order and the
        // route reads req.body.assetId while streaming the file part.
        form.append('assetId', assetId)
        form.append('asset', new Blob([bytes], {
            type: asset.mimeType || source.headers.get('content-type') || 'application/octet-stream'
        }), asset.name || assetId)
        const upload = await call(to, `/api/projects/${projectId}/assets`, { method: 'POST', body: form }, TRANSFER_TIMEOUT_MS)
        if (upload.ok) moved++
    }
    return moved
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
