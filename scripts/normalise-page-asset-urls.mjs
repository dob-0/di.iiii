/**
 * normalise-page-asset-urls.mjs — rewrite absolute, same-endpoint-shape asset
 * URLs baked into a project's codeHtml/codeFiles into tier-independent
 * relative paths.
 *
 * A published "code" page renders inside an about:srcdoc iframe, which
 * inherits its base URL from the shell page that set it (see
 * src/utils/presentationPreviewDocument.js) — so a bare
 * `/serverXR/api/projects/<pid>/assets/<sha>` already resolves against
 * whichever tier is actually serving the page. An absolute copy of that same
 * path (`https://staging.di-studio.xyz/serverXR/api/projects/<pid>/assets/<sha>`)
 * pins the page to the tier it was written on instead: copy the page to
 * another tier and the image either points back at the wrong tier or 404s
 * because that asset id was never uploaded there.
 *
 * This script does NOT touch og:image / canonical / plain hyperlinks — only
 * the `/api/(projects|spaces)/.../assets/...` endpoint shape, reusing the
 * exact pattern the render-time fix strips (stripSameOriginAssetHosts).
 *
 * Usage:
 *   node scripts/normalise-page-asset-urls.mjs --tier local --project main/suite
 *   node scripts/normalise-page-asset-urls.mjs --tier staging --space dilijan --write
 *   node scripts/normalise-page-asset-urls.mjs --tier prod --space br_id_ge --i-know --write
 *
 * Options:
 *   --tier <local|staging|prod>  Required. Which tier's documents to read/write.
 *   --project <spaceId/slug>     One project, repeatable. Either this or --space.
 *   --space <spaceId>            Every project in this space (repeatable).
 *   --compare-tier <tier>        Before touching a project, also fetch it from
 *                                this tier and count matches there. If the count
 *                                differs, the project is a REFUSAL, not a rewrite
 *                                — a different count says the two copies aren't
 *                                the same page localised per tier, they've drifted,
 *                                and blindly rewriting would paper over that.
 *   --dry-run                    Default. Print the before/after count, write nothing.
 *   --write                      Actually PUT the rewritten document back.
 *   --i-know                     Required in addition to --write when --tier prod.
 *
 * Tokens come from serverXR/.env.local: API_TOKEN (local), LIVE_API_TOKEN
 * (staging), PROD_API_TOKEN (production) — same convention as tier-sync.mjs.
 * Never printed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripSameOriginAssetHosts } from '../src/utils/presentationPreviewDocument.js'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TIMEOUT_MS = 30000

export const TIERS = {
    local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' },
    staging: { base: 'https://staging.di-studio.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' },
    prod: { base: 'https://di-studio.xyz/serverXR', tokenKey: 'PROD_API_TOKEN' }
}

// Same shape the render-time fix strips — kept here only for counting,
// never for rewriting (rewriting reuses stripSameOriginAssetHosts itself so
// the two can never drift apart).
const ASSET_URL_PATTERN = /(^|["'`(=])https?:\/\/[^\s"'`()<>]+?((?:\/serverXR)?\/api\/(?:projects|spaces)\/[^\s"'`()<>]+?\/assets\/[^\s"'`()<>]+)(?=["'`)>\s]|$)/gi

const countMatches = (text = '') => (String(text || '').match(ASSET_URL_PATTERN) || []).length

export const readEnv = (rootDir = ROOT_DIR) => {
    const file = path.join(rootDir, 'serverXR', '.env.local')
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

export const parseArgs = (argv) => {
    const args = { tier: null, projects: [], spaces: [], compareTier: null, write: false, iKnow: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--tier') args.tier = argv[++i]
        else if (arg === '--project') args.projects.push(argv[++i])
        else if (arg === '--space') args.spaces.push(argv[++i])
        else if (arg === '--compare-tier') args.compareTier = argv[++i]
        else if (arg === '--write') args.write = true
        else if (arg === '--dry-run') args.write = false
        else if (arg === '--i-know') args.iKnow = true
    }
    return args
}

/**
 * Normalise one document's codeHtml/codeFiles in place (a shallow-cloned
 * copy). Returns { document, before, after } — `before`/`after` are the
 * total match counts across codeHtml + every codeFile, so a caller can print
 * or gate on "0 changes" without diffing strings itself.
 */
export const normaliseDocument = (document) => {
    const presentationState = document?.presentationState
    if (!presentationState) return { document, before: 0, after: 0 }

    let before = 0
    let after = 0
    const next = { ...document, presentationState: { ...presentationState } }

    if (typeof presentationState.codeHtml === 'string') {
        before += countMatches(presentationState.codeHtml)
        next.presentationState.codeHtml = stripSameOriginAssetHosts(presentationState.codeHtml)
        after += countMatches(next.presentationState.codeHtml)
    }

    if (Array.isArray(presentationState.codeFiles)) {
        next.presentationState.codeFiles = presentationState.codeFiles.map((file) => {
            const content = typeof file?.content === 'string' ? file.content : ''
            before += countMatches(content)
            const rewritten = stripSameOriginAssetHosts(content)
            after += countMatches(rewritten)
            return { ...file, content: rewritten }
        })
    }

    return { document: next, before, after }
}

const resolveProjectList = async ({ call, tier, args }) => {
    const explicit = args.projects.map((p) => {
        const idx = p.indexOf('/')
        return idx === -1 ? { spaceId: null, projectId: p } : { spaceId: p.slice(0, idx), projectId: p.slice(idx + 1) }
    })
    const fromSpaces = []
    for (const spaceId of args.spaces) {
        const res = await call(tier, `/api/spaces/${spaceId}/projects`)
        if (!res.ok) {
            console.error(`  ⚠ could not list projects for space ${spaceId}: HTTP ${res.status}`)
            continue
        }
        const body = await res.json()
        const projects = body.projects || body || []
        for (const p of projects) fromSpaces.push({ spaceId, projectId: p.id || p.projectId || p.slug })
    }
    return [...explicit, ...fromSpaces]
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (!TIERS[args.tier]) {
        console.error('usage: node scripts/normalise-page-asset-urls.mjs --tier <local|staging|prod> (--project <spaceId/slug> | --space <spaceId>) [--compare-tier <tier>] [--write] [--i-know]')
        process.exit(1)
    }
    if (!args.projects.length && !args.spaces.length) {
        console.error('refused: pass at least one --project <spaceId/slug> or --space <spaceId> — this is a named-set tool, not a whole-tier sweep.')
        process.exit(1)
    }
    if (args.tier === 'prod' && args.write && !args.iKnow) {
        console.error('refused: --tier prod --write requires --i-know as well.')
        process.exit(1)
    }
    if (args.compareTier && !TIERS[args.compareTier]) {
        console.error(`unknown --compare-tier ${args.compareTier}`)
        process.exit(1)
    }

    const env = readEnv()
    const tier = { ...TIERS[args.tier], token: env[TIERS[args.tier].tokenKey] }
    const compareTier = args.compareTier ? { ...TIERS[args.compareTier], token: env[TIERS[args.compareTier].tokenKey] } : null

    const call = async (t, pathname, options = {}) => fetch(t.base + pathname, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(t.token ? { Authorization: `Bearer ${t.token}` } : {}),
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    const projects = await resolveProjectList({ call, tier, args })
    if (!projects.length) {
        console.log('nothing to do — no projects resolved from --project/--space')
        return
    }

    console.log(`${args.write ? 'WRITE' : 'DRY-RUN'} on tier=${args.tier}${compareTier ? ` (verified against ${args.compareTier})` : ''}, ${projects.length} project(s)\n`)

    let totalBefore = 0
    let totalAfter = 0
    let touched = 0
    let refused = 0

    for (const { spaceId, projectId } of projects) {
        const label = spaceId ? `${spaceId}/${projectId}` : projectId
        const docRes = await call(tier, `/api/projects/${projectId}/document`)
        if (!docRes.ok) {
            console.log(`  ${label}: ⚠ HTTP ${docRes.status} fetching document — skipped`)
            continue
        }
        const body = await docRes.json()
        const document = body.document || body
        const { document: rewritten, before, after } = normaliseDocument(document)

        if (before === 0) {
            console.log(`  ${label}: 0 matches — nothing to do`)
            continue
        }

        if (compareTier) {
            const otherRes = await call(compareTier, `/api/projects/${projectId}/document`)
            if (otherRes.ok) {
                const otherBody = await otherRes.json()
                const otherDoc = otherBody.document || otherBody
                const otherBefore = normaliseDocument(otherDoc).before
                if (otherBefore !== before) {
                    console.log(`  ${label}: REFUSED — asymmetric match count (${args.tier}=${before} vs ${args.compareTier}=${otherBefore}); these look like drifted copies, not the same page localised per tier`)
                    refused++
                    continue
                }
            } else {
                console.log(`  ${label}: ⚠ could not verify symmetry (${args.compareTier} HTTP ${otherRes.status}) — proceeding without verification`)
            }
        }

        console.log(`  ${label}: ${before} → ${after} absolute asset URL(s)${args.write ? '' : ' (would rewrite)'}`)
        totalBefore += before
        totalAfter += after
        touched++

        if (args.write) {
            const putRes = await call(tier, `/api/projects/${projectId}/document`, {
                method: 'PUT',
                body: JSON.stringify(rewritten)
            })
            if (!putRes.ok) console.log(`    ⚠ write failed: HTTP ${putRes.status}`)
            else console.log('    ✓ written')
        }
    }

    console.log(`\n${touched} project(s) with matches, ${refused} refused, ${totalBefore} → ${totalAfter} absolute asset URL(s) total${args.write ? '' : ' (dry-run — nothing written; pass --write to apply)'}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}
