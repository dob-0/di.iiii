/**
 * space-proposal.mjs — send a .diiii file to a tier as a PROPOSAL.
 *
 * Reached through the bundle tool:
 *   node scripts/space-bundle.mjs propose <file.diiii> --tier dev [options]
 *
 * The file goes to POST /api/spaces/<id>/proposals on that tier's server. It
 * never writes anything by itself: the server reads the file, answers with a
 * summary (which projects change, item counts before → after, new files,
 * anything newer on the tier that applying would overwrite), and holds it as a
 * `content.apply` approval the inner bot shows with Apply / Reject. Apply takes
 * a restore point first. See serverXR/src/contentProposals.js.
 *
 * Options:
 *   --tier <local|dev|prod>  Which server (default: dev). Token from
 *                            serverXR/.env.local or the environment:
 *                            API_TOKEN / LIVE_API_TOKEN / PROD_API_TOKEN.
 *   --space <id>             Target space (default: the id inside the file)
 *   --from "<name>"          Whose work this is, when you send it for someone
 *                            ("Emilya"). Shown to the approver.
 *   --dry-run                Show the summary; create nothing.
 *   --direct                 Apply now if the server says you are trusted
 *                            (owner/admin/trusted list) instead of proposing.
 *   --overwrite-newer        Propose even though the tier changed after the
 *                            file was exported (the summary lists what).
 *   --allow-production       Required with --tier prod.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIERS, localBase, resolveTier, isProductionTarget } from './tier-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 180000

const fail = (message) => { const e = new Error(message); e.userFacing = true; throw e }

export const parseProposeArgs = (argv) => {
    const args = { file: null, tier: 'dev', space: null, from: null, dryRun: false, direct: false, overwriteNewer: false, allowProduction: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--tier') args.tier = resolveTier(argv[++i])
        else if (a === '--space') args.space = argv[++i]
        else if (a === '--from') args.from = argv[++i]
        else if (a === '--dry-run') args.dryRun = true
        else if (a === '--direct') args.direct = true
        else if (a === '--overwrite-newer') args.overwriteNewer = true
        else if (a === '--allow-production') args.allowProduction = true
        else if (a.startsWith('--')) fail(`unknown option ${a}`)
        else if (!args.file) args.file = a
        else fail(`unexpected argument ${a}`)
    }
    return args
}

// serverXR/.env.local first, the environment wins where set — same as tier-sync.
const readTokens = () => {
    const env = {}
    const file = path.join(ROOT_DIR, 'serverXR', '.env.local')
    if (fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
            if (!line.includes('=') || line.trim().startsWith('#')) continue
            const i = line.indexOf('=')
            env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
        }
    }
    for (const key of ['API_TOKEN', 'LIVE_API_TOKEN', 'PROD_API_TOKEN', 'LOCAL_API_URL']) {
        if (process.env[key]) env[key] = process.env[key]
    }
    return env
}

// The space id inside the file, without unpacking all of it.
const spaceIdInFile = async (file) => {
    const { execFileSync } = await import('node:child_process')
    try {
        const text = execFileSync('tar', ['-xzOf', file, './bundle.json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
        return JSON.parse(text).spaceId || null
    } catch {
        try {
            const text = execFileSync('tar', ['-xzOf', file, 'bundle.json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
            return JSON.parse(text).spaceId || null
        } catch { return null }
    }
}

export const formatOutcome = (status, body) => {
    const lines = []
    if (body?.text) lines.push(body.text, '')
    if (status === 202) lines.push(`→ proposal ${body.approvalId} is waiting for Apply / Reject in the inner bot (expires ${new Date(body.expiresAt).toISOString()})`)
    else if (body?.status === 'applied') lines.push(`→ applied (you are trusted here). Restore point: ${body.result?.restorePoint || 'none'}`)
    else if (body?.status === 'dry_run') lines.push('→ dry run: nothing was created')
    else if (body?.status === 'nothing_to_apply') lines.push('→ nothing to apply: the space already matches this file')
    else lines.push(`→ refused (${status}): ${body?.error || 'unknown error'}${body?.code ? ` [${body.code}]` : ''}`)
    return lines.join('\n')
}

export async function proposeBundle(argv) {
    const args = parseProposeArgs(argv)
    if (!args.file || !fs.existsSync(args.file)) fail(`file not found: ${args.file || '(none given)'}`)
    const tier = TIERS[args.tier]
    if (!tier) fail(`unknown tier "${args.tier}" (local, dev, prod)`)
    const env = readTokens()
    const base = args.tier === 'local' ? localBase(env) : tier.base
    if (isProductionTarget(base) && !args.allowProduction) {
        fail('this is production. Propose on the dev tier first; add --allow-production only when the owner asked for it.')
    }
    const token = env[tier.tokenKey]
    if (!token) fail(`no ${tier.tokenKey} in serverXR/.env.local or the environment`)
    const spaceId = args.space || await spaceIdInFile(args.file)
    if (!spaceId) fail('could not read the space id from the file; pass --space <id>')

    const form = new FormData()
    form.append('mode', args.direct ? 'auto' : 'propose')
    if (args.from) form.append('from', args.from)
    if (args.dryRun) form.append('dryRun', 'true')
    if (args.overwriteNewer) form.append('overwriteNewer', 'true')
    form.append('bundle', new Blob([fs.readFileSync(args.file)]), path.basename(args.file).endsWith('.diiii') ? path.basename(args.file) : `${spaceId}.diiii`)

    const url = `${base}/api/spaces/${encodeURIComponent(spaceId)}/proposals`
    const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    console.log(formatOutcome(response.status, body))
    return response.ok ? 0 : 1
}
