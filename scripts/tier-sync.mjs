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
 *   node scripts/tier-sync.mjs --from local --to staging --audit
 *
 * Options:
 *   --audit             Compare DOCUMENTS, write nothing, exit 1 on any drift.
 *                       The plain run only ever compares project ids, so it
 *                       reports "in sync" while two tiers hold the same slug
 *                       with different work inside it. That is the drift that
 *                       actually bites: `local-mirror` fills the dev box from
 *                       PRODUCTION first and never refreshes a project it has
 *                       already seen, so a project edited on staging reads
 *                       differently on localhost for as long as both exist.
 *   --space <id>        Only this space (default: every space the source has)
 *   --no-assets         Documents only — faster, and leaves images unresolvable
 *   --force             Overwrite documents that already exist at the destination
 *   --dry-run           Print the plan and write nothing
 *   --allow-production  Required before anything may be written to di-studio.xyz
 *
 * Tokens come from serverXR/.env.local: API_TOKEN (local), LIVE_API_TOKEN
 * (staging), PROD_API_TOKEN (production).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { remapAssetIds, remapFromUpload } from './asset-remap-lib.mjs'

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

// Fields that change without the work changing.
//
// `projectMeta.createdAt` and `updatedAt` are the big ones, and they are not
// about the work at all: they record when THAT DATABASE first saw the row. A
// project copied from one tier to another is stamped on arrival, so every
// project this script has ever moved reads as changed the moment it lands.
// Measured on the first run — 155 differences reported, of which 138 were
// nothing but these two numbers.
//
// `lastExportAt` is stamped by the act of publishing and `clockEpoch` by the
// first Time node to exist in a window, so two tiers holding the identical
// page disagree on both.
//
// Reporting any of them would teach someone to ignore the audit, which costs
// more than not having written it.
export const VOLATILE_PATHS = [
    'projectMeta.createdAt',
    'projectMeta.updatedAt',
    'publishState.lastExportAt',
    'showState.clockEpoch'
]

const stripVolatile = (document) => {
    const copy = JSON.parse(JSON.stringify(document ?? {}))
    for (const dotted of VOLATILE_PATHS) {
        const parts = dotted.split('.')
        const leaf = parts.pop()
        let node = copy
        for (const part of parts) node = node?.[part]
        if (node && typeof node === 'object') delete node[leaf]
    }
    return copy
}

// Key order is whatever the two servers happened to serialize, and a document
// that round-trips through a PUT can come back with its keys rearranged. Sort
// them, or the audit reports drift on documents that are byte-for-byte the
// same work.
const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
    }
    return JSON.stringify(value ?? null)
}

/**
 * What a document IS, reduced to something two tiers can be compared on.
 *
 * The counts are for a human reading the report — "265 entities here, 0 there"
 * says what went wrong far better than two hashes do. The hash is what the
 * comparison actually turns on, because a page can be rewritten without any
 * count moving at all.
 */
export const documentSignature = (document) => {
    const d = document ?? {}
    const presentation = d.presentationState ?? {}
    return {
        entities: (d.entities ?? []).length,
        nodes: (d.nodes ?? []).length,
        assets: (d.assets ?? []).length,
        // A published page lives in `presentationState.codeHtml`, NOT in
        // entities. Measuring substance by entity count alone reads a 358KB
        // brand guide as an empty project — which is exactly how a purge of
        // "empty" projects nearly took the whole Dilijan camp with it.
        page: (presentation.codeHtml ?? '').length,
        hash: sha1(stable(stripVolatile(d))),
        shape: sha1(byName(stripVolatile(d)))
    }
}

const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)

/**
 * The same document with every asset addressed by NAME instead of by id.
 *
 * Asset ids are content hashes, and the upload route strips EXIF/GPS before
 * hashing — so the same photograph, uploaded to two tiers, is legitimately
 * stored at two different addresses. Comparing ids alone reports every
 * photo-carrying project as drifted, forever, on tiers that hold identical
 * work. That is the report nobody reads.
 *
 * Comparing by name is not proof the pictures are the same — nothing in the
 * document can prove that once the bytes have been rewritten — so this feeds a
 * SEPARATE class in the report, never a claim of equality. A photograph
 * actually swapped for another changes its filename, and `hash` catches
 * anything that `shape` does not.
 */
const byName = (document) => {
    const assets = Array.isArray(document.assets) ? document.assets : []
    const names = assets.filter((a) => a?.id).map((a) => [a.id, a.name || a.id])
    const reduced = {
        ...document,
        assets: assets.map((a) => ({ name: a?.name ?? '', mimeType: a?.mimeType ?? '' }))
    }
    let json = stable(reduced)
    for (const [id, name] of names) json = json.split(id).join(`asset:${name}`)
    return json
}

export const signaturesMatch = (a, b) => Boolean(a && b && a.hash === b.hash)

/**
 * Every way two inventories of signatures disagree.
 *
 * `missing` and `extra` are what the id comparison already saw. `differs` is
 * the class it was blind to: the same slug on both tiers, holding different
 * work. Nothing here is a plan — the audit reports and stops, because which
 * side is right is a question about the work and not about the data.
 */
export const planAudit = ({ source, destination }) => {
    const missing = []
    const extra = []
    const differs = []
    const readdressed = []
    const spaces = [...new Set([...Object.keys(source), ...Object.keys(destination)])].sort()
    for (const spaceId of spaces) {
        const from = source[spaceId] ?? {}
        const to = destination[spaceId] ?? {}
        for (const projectId of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
            const a = from[projectId]
            const b = to[projectId]
            if (a && !b) missing.push({ spaceId, projectId, source: a })
            else if (!a && b) extra.push({ spaceId, projectId, destination: b })
            else if (signaturesMatch(a, b)) continue
            // Same work, different asset addresses. Reported, but not drift to
            // fix: the scrubber re-hashes on arrival, so this is what a
            // correctly-copied photograph looks like across two tiers.
            else if (a.shape && a.shape === b.shape) readdressed.push({ spaceId, projectId, source: a, destination: b })
            else differs.push({ spaceId, projectId, source: a, destination: b })
        }
    }
    return { missing, extra, differs, readdressed }
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
    const args = { from: null, to: null, space: null, assets: true, force: false, dryRun: false, allowProduction: false, audit: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--from') args.from = argv[++i]
        else if (arg === '--to') args.to = argv[++i]
        else if (arg === '--space') args.space = argv[++i]
        else if (arg === '--no-assets') args.assets = false
        else if (arg === '--force') args.force = true
        else if (arg === '--dry-run') args.dryRun = true
        else if (arg === '--audit') args.audit = true
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

    if (isProductionTarget(to.base) && !args.allowProduction && !args.audit) {
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

    // The audit's inventory: every document, reduced to a signature. Far
    // slower than listing ids — one request per project per tier — and the
    // only reading that can see a slug whose contents have diverged.
    const readSignatures = async (tier, only) => {
        const spaces = (await listSpaces(tier)).filter((id) => !only || id === only)
        const inventory = {}
        for (const spaceId of spaces) {
            inventory[spaceId] = {}
            for (const projectId of await listProjects(tier, spaceId)) {
                const res = await call(tier, `/api/projects/${projectId}/document`, {}, TRANSFER_TIMEOUT_MS)
                if (!res.ok) continue
                const body = await res.json()
                inventory[spaceId][projectId] = documentSignature(body.document || body)
            }
        }
        return inventory
    }

    if (args.audit) {
        console.log(`tier-sync audit  ${args.from} ↔ ${args.to}  (reading every document — this takes a minute)`)
        const [a, b] = [await readSignatures(from, args.space), await readSignatures(to, args.space)]
        const { missing, extra, differs, readdressed } = planAudit({ source: a, destination: b })

        const shape = (s) => s ? `${s.entities}e ${s.nodes}n ${s.assets}a ${s.page}p` : '—'
        const report = (title, rows, render) => {
            if (!rows.length) return
            console.log(`\n${title}`)
            rows.forEach((row) => console.log(`   ${`${row.spaceId}/${row.projectId}`.padEnd(48)}${render(row)}`))
        }
        report(`only on ${args.from} (${missing.length})`, missing, (r) => shape(r.source))
        report(`only on ${args.to} (${extra.length})`, extra, (r) => shape(r.destination))
        report(`same slug, DIFFERENT work (${differs.length})`, differs,
            (r) => `${args.from}: ${shape(r.source).padEnd(22)}${args.to}: ${shape(r.destination)}`)
        report(`same work, assets re-addressed on arrival (${readdressed.length}) — not drift to fix`,
            readdressed, (r) => shape(r.source))

        const total = missing.length + extra.length + differs.length
        console.log(total
            ? `\n${total} difference(s). e=entities n=nodes a=assets p=published page, in characters.`
            : '\nthe two tiers hold the same work.')
        if (readdressed.length && !total) {
            console.log(`${readdressed.length} project(s) hold the same assets under different ids — see above.`)
        }
        if (total) process.exitCode = 1
        return
    }

    console.log(`tier-sync  ${args.from} → ${args.to}${args.dryRun ? '  (dry run)' : ''}`)
    const source = await readInventory(from, args.space)
    const destination = await readInventory(to, args.space)
    const plan = planSync({ source, destination, force: args.force })

    if (!plan.length) {
        // Deliberately not "in sync". This compared ids; two tiers can hold
        // every slug in common and different work inside every one of them.
        console.log('\nno project is MISSING from the destination.')
        console.log('this compared ids only — run with --audit to compare the documents themselves.')
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
                    const { moved, remap } = await copyAssets({ call, from, to, projectId, document })
                    assetNote = moved ? `, ${moved} asset(s)` : ''
                    // The document above carries the SOURCE's asset ids. Any the
                    // destination re-addressed must be followed there, or the copy
                    // renders grey where the original renders a photograph.
                    if (Object.keys(remap).length) {
                        await call(to, `/api/projects/${projectId}/document`, {
                            method: 'PUT',
                            body: JSON.stringify(remapAssetIds(document, remap))
                        }, TRANSFER_TIMEOUT_MS)
                        assetNote += `, ${Object.keys(remap).length} re-addressed`
                    }
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

// Assets USUALLY carry their ids across, so the document's existing
// /api/projects/<id>/assets/<assetId> references usually resolve untouched.
// They do not when the destination rewrites the bytes: the upload route strips
// EXIF/GPS before hashing, and a scrubbed file no longer hashes to the id we
// sent, so it is stored under a new content address and the route still
// answers 200. Returns the remap the caller must follow in the document.
const copyAssets = async ({ call, from, to, projectId, document }) => {
    const assets = Array.isArray(document?.assets) ? document.assets : []
    const remap = {}
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
        if (!upload.ok) continue
        const changed = remapFromUpload({ requestedId: assetId, response: await upload.json().catch(() => null) })
        if (changed) Object.assign(remap, changed)
        moved++
    }
    return { moved, remap }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
