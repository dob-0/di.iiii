/**
 * local-mirror.mjs — make the local dev tier hold every space production has.
 *
 * The local dev box is a tier like staging and prod, but the only one nothing
 * keeps in step: it is declared `governed: false` (spaces/README.md), so
 * `spaces:audit` prints its drift and still exits 0. The result is a dev box
 * that quietly holds a handful of spaces months after production grew past
 * them — the local DB is a separate SQLite file, and nothing has ever copied
 * a space into it without someone naming that space by hand.
 *
 * This walks production's own space list (the authority — a declaration only
 * covers the spaces someone wrote a file for) and, for each one, makes sure
 * the local server has the space with production's metadata and every project
 * inside it.
 *
 * Usage:
 *   node scripts/local-mirror.mjs [options]
 *
 * Options:
 *   --tier <prod|staging|all>
 *                     Which tier to mirror. Default `all`: production first,
 *                     then staging for spaces production does not have — a
 *                     space can be built on staging and not yet promoted
 *                     (`dilijan` was, for a month), and mirroring prod alone
 *                     silently leaves it out with nothing reporting a miss.
 *                     Prod always wins for a space both tiers hold.
 *   --space   <id>    Mirror only this space (repeatable)
 *   --from    <url>   Source API base — overrides --tier
 *   --token   <token> Bearer token for the source (default: the tier's own).
 *                     Without it only public spaces are visible.
 *   --to      <url>   Local API base (default: $LOCAL_API_URL or http://localhost:4000/serverXR)
 *   --to-token <token> Bearer token for the local server (default: $API_TOKEN)
 *   --no-assets       Structure only — skip asset binaries (a full mirror is ~435 MB)
 *   --force           Overwrite documents of projects that already exist locally
 *   --dry-run         Print what would change and write nothing
 *
 * Existing local projects are left alone unless --force: the dev box holds
 * work that exists on no other tier, and a mirror is not a reason to lose it.
 * Nothing is ever deleted — extras local-only are reported, never removed.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LOCAL_URL = 'http://localhost:4000/serverXR'

// The tier map matches spaces/README.md: PROD_API_TOKEN for production,
// LIVE_API_TOKEN for staging. Order matters — production is walked first so a
// space both tiers hold is taken from production.
const TIERS = {
    prod: { urlEnv: 'PROD_API_URL', tokenEnv: 'PROD_API_TOKEN', fallbackUrl: 'https://di-studio.xyz/serverXR' },
    staging: { urlEnv: 'LIVE_API_URL', tokenEnv: 'LIVE_API_TOKEN', fallbackUrl: 'https://staging.di-studio.xyz/serverXR' },
}

// Sandboxes are per-account scratch space, provisioned lazily on first visit.
// Copying someone else's sandbox to a dev box means nothing.
const isSandbox = (spaceId) => /^sandbox-/.test(spaceId)

const parseArgs = (argv) => {
    const args = {
        spaces: [],
        tier: 'all',
        from: null,
        token: null,
        to: null,
        toToken: null,
        assets: true,
        force: false,
        dryRun: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--tier') { args.tier = argv[++i]; continue }
        if (arg === '--space') { args.spaces.push(argv[++i]); continue }
        if (arg === '--from') { args.from = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--to-token') { args.toToken = argv[++i]; continue }
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
            // An empty assignment is a placeholder, not a value. The root .env
            // carries `LIVE_API_TOKEN=` with nothing after it and is merged
            // last, so keeping it would blank the real token that
            // serverXR/.env.local holds — and the only symptom is staging
            // quietly answering with public spaces only.
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

const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
        const text = await response.text().catch(() => '')
        const error = new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`)
        error.status = response.status
        throw error
    }
    return response.json()
}

const apiFetchOptional = async (url, options = {}) => {
    try {
        return await apiFetch(url, options)
    } catch (error) {
        if (error.status === 404) return null
        throw error
    }
}

// POST /api/spaces accepts label/slug/permanent/allowEdits and nothing else;
// everything that decides whether a space is reachable — isPublic above all —
// is PATCH-only. A space created without this second step exists but stays
// invisible, which is the failure this script was written to end.
//
// `kind` and `permanent` are deliberately NOT mirrored. The local server sets
// them for itself at boot (`ensureDefaultSpace`, `ensureOpenSpace`), and the
// open space is `kind: global` locally while production reports `normal` —
// copying that across would demote the local open space to satisfy drift on
// another tier. Structure is the install's own; content is what we mirror.
const SPACE_FIELDS = ['label', 'isPublic', 'openInscriptions', 'allowEdits']

const main = async () => {
    const env = {
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    }
    const getEnv = (key) => process.env[key] || env[key] || ''

    const args = parseArgs(process.argv.slice(2))
    const toBase = (args.to || getEnv('LOCAL_API_URL') || DEFAULT_LOCAL_URL).replace(/\/+$/, '')
    const localToken = args.toToken || getEnv('API_TOKEN') || ''
    const { dryRun, force } = args

    // --from is an explicit override and names no tier; otherwise walk the
    // requested tiers in TIERS order, production first.
    const sources = args.from
        ? [{ name: 'source', base: args.from.replace(/\/+$/, ''), token: args.token || '' }]
        : Object.entries(TIERS)
            .filter(([name]) => args.tier === 'all' || args.tier === name)
            .map(([name, tier]) => ({
                name,
                base: (getEnv(tier.urlEnv) || tier.fallbackUrl).replace(/\/+$/, ''),
                token: args.token || getEnv(tier.tokenEnv) || '',
            }))

    if (!sources.length) {
        throw new Error(`Unknown --tier "${args.tier}" — expected one of: prod, staging, all`)
    }

    console.log('[local-mirror]')
    for (const source of sources) {
        console.log(`  from: ${source.name.padEnd(8)} ${source.base}${source.token ? '' : '   (no token — public spaces only)'}`)
    }
    console.log(`  to:   ${toBase}`)
    if (dryRun) console.log('  dry-run: nothing will be written')
    if (!args.assets) console.log('  --no-assets: structure only')

    const local = await apiFetchOptional(`${toBase}/api/spaces`, { headers: buildHeaders(localToken) })
    if (!local) throw new Error(`Local server not reachable at ${toBase} — start it with: npm run dev`)
    const localById = new Map((local.spaces || []).map((s) => [s.id, s]))

    // A space both tiers hold is taken from the first that offers it, and the
    // tier it came from is printed — a staging-only space is a fact about the
    // estate (something built and not yet promoted), not a detail to bury.
    const wanted = []
    const seen = new Set()
    for (const source of sources) {
        const remote = await apiFetch(`${source.base}/api/spaces`, { headers: buildHeaders(source.token) })
        for (const space of remote.spaces || []) {
            if (isSandbox(space.id) || seen.has(space.id)) continue
            if (args.spaces.length && !args.spaces.includes(space.id)) continue
            seen.add(space.id)
            wanted.push({ ...space, source })
        }
    }

    if (args.spaces.length) {
        const missing = args.spaces.filter((id) => !seen.has(id))
        for (const id of missing) console.log(`  ! "${id}" is on no source tier — skipped`)
    }

    console.log(`\n${wanted.length} space(s) across ${sources.length} tier(s), ${localById.size} local\n`)

    const created = []
    const patched = []
    const pulled = []
    const kept = []
    const failed = []

    for (const space of wanted) {
        const id = space.id
        const here = localById.get(id)
        const { base: fromBase, token } = space.source
        const origin = sources.length > 1 ? `  [${space.source.name}]` : ''
        console.log(`── ${id}  "${space.label}"${space.isPublic ? '' : '  (private)'}${origin}`)

        if (!here) {
            console.log(`   space missing locally — creating`)
            if (!dryRun) {
                await apiFetch(`${toBase}/api/spaces`, {
                    method: 'POST',
                    headers: buildHeaders(localToken),
                    body: JSON.stringify({ slug: id, label: space.label || id, permanent: !!space.permanent }),
                })
            }
            created.push(id)
        }

        // Reconcile metadata whether the space was just created or already
        // existed: creation cannot carry isPublic, and a space that drifted
        // private is one nobody can open.
        const drift = {}
        for (const field of SPACE_FIELDS) {
            const want = space[field]
            if (want === undefined || want === null) continue
            if (!here || here[field] !== want) drift[field] = want
        }
        if (Object.keys(drift).length) {
            const summary = Object.entries(drift).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
            console.log(`   set ${summary}`)
            if (!dryRun) {
                await apiFetch(`${toBase}/api/spaces/${id}`, {
                    method: 'PATCH',
                    headers: buildHeaders(localToken),
                    body: JSON.stringify(drift),
                })
            }
            patched.push(id)
        }

        const remoteProjects = (await apiFetchOptional(
            `${fromBase}/api/spaces/${id}/projects`,
            { headers: buildHeaders(token) }
        ))?.projects || []
        const localProjects = (await apiFetchOptional(
            `${toBase}/api/spaces/${id}/projects`,
            { headers: buildHeaders(localToken) }
        ))?.projects || []
        const localProjectIds = new Set(localProjects.map((p) => p.id))

        for (const project of remoteProjects) {
            const exists = localProjectIds.has(project.id)
            if (exists && !force) {
                console.log(`   · ${project.id} — already here, left alone`)
                kept.push(`${id}/${project.id}`)
                continue
            }
            const publish = space.publishedProjectId === project.id
            console.log(`   ↓ ${project.id}${publish ? '  (published scene)' : ''}${exists ? '  (overwrite)' : ''}`)
            if (dryRun) { pulled.push(`${id}/${project.id}`); continue }

            const pullArgs = [
                path.join(ROOT_DIR, 'scripts', 'project-pull.mjs'),
                project.id,
                '--space', id,
                '--from', fromBase,
                '--to', toBase,
            ]
            if (token) pullArgs.push('--token', token)
            if (localToken) pullArgs.push('--to-token', localToken)
            if (publish) pullArgs.push('--publish')
            if (!args.assets) pullArgs.push('--no-assets')
            if (force) pullArgs.push('--force')

            try {
                const { stdout } = await execFileAsync(process.execPath, pullArgs, {
                    cwd: ROOT_DIR,
                    maxBuffer: 32 * 1024 * 1024,
                })
                const assetLine = stdout.split('\n').find((l) => /copied, .* already present/.test(l))
                if (assetLine) console.log(`     ${assetLine.trim()}`)
                pulled.push(`${id}/${project.id}`)
            } catch (error) {
                // project-pull reports its own failures on stderr; falling back
                // to the last stdout line prints its progress chatter instead
                // of the reason, which is how a 401 once read as "0 assets".
                const detail = (error.stderr || '').trim()
                    || (error.stdout || '').split('\n').filter(Boolean).slice(-1)[0]
                    || error.message
                console.log(`     failed: ${detail.trim()}`)
                failed.push(`${id}/${project.id}`)
            }
        }

        // A space whose published project is missing renders as a black void,
        // so say it rather than leaving it to be discovered in the browser.
        if (space.publishedProjectId && !remoteProjects.some((p) => p.id === space.publishedProjectId)) {
            console.log(`   ! published project "${space.publishedProjectId}" is not in the source's project list`)
        }
    }

    const localOnly = [...localById.keys()].filter(
        (id) => !isSandbox(id) && !wanted.some((s) => s.id === id)
    )

    console.log('\n───────────')
    console.log(`spaces created:  ${created.length}${created.length ? '  ' + created.join(', ') : ''}`)
    console.log(`spaces adjusted: ${patched.length}${patched.length ? '  ' + patched.join(', ') : ''}`)
    console.log(`projects pulled: ${pulled.length}`)
    console.log(`projects kept:   ${kept.length}  (already local — --force to overwrite)`)
    if (failed.length) console.log(`projects FAILED: ${failed.length}  ${failed.join(', ')}`)
    if (localOnly.length) console.log(`local-only spaces (never touched): ${localOnly.join(', ')}`)
    if (dryRun) console.log('\ndry-run: nothing was written')
    else console.log('\nOpen http://localhost:5173/spaces')

    if (failed.length) process.exitCode = 1
}

export { parseArgs, isSandbox, loadEnvFile, SPACE_FIELDS, TIERS }

// Only run when invoked as a script, so the helpers above can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exitCode = 1
    })
}
