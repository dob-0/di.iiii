#!/usr/bin/env node
/**
 * push-node-examples.mjs — put the per-node examples into a real di.iiii,
 * one project per family (e.g. "examples · numbers"), laid out as a
 * readable grid rather than one vertical tower.
 *
 * Uses the same APIs the app itself uses (src/project/services/projectsApi.js):
 *   GET  /api/health                          — reachability probe (normalizeBase)
 *   POST /api/spaces/:space/projects           {slug, title}        — create the project
 *   POST /api/projects/:project/ops             {baseVersion, ops}   — place every node/edge
 *
 * Layout (docs/ai/audits/2026-09-14-raw-fix-plan.md round 2, "examples wave"):
 * a family's examples used to stack in ONE column BLOCK_HEIGHT apart — for a
 * 38-example family (numbers, 126 nodes) that is a tower the canvas cannot
 * fit: at minimum zoom you see three examples and no text is readable
 * (docs/ai/audits/raw-audit-2026-09-14/walk/d-numbers.png). The actual grid
 * math (chunking, cell sizing off cardGeometry.js, the caption label) lives
 * in src/project/graph/examples/nodes/layout.js — pure and unit-tested
 * (layout.test.js) — because it has to be re-derivable without a server:
 *   - examples fill a grid, GRID_COLS per row (default 4), left-to-right,
 *     top-to-bottom, in the family file's own order (already authored most-
 *     basic-first — see numbers.js's header comment);
 *   - each cell is sized to that example's OWN bounding box, measured with
 *     cardGeometry.js's real getCardBox/cardHeight (the same box the canvas
 *     actually draws — previews, viewers and all), not a guess;
 *   - a family bigger than MAX_EXAMPLES_PER_PROJECT splits into several
 *     projects ("examples · numbers 1/4", "2/4", …) instead of one tower;
 *   - each example's first card (top-left by reading order) gets a plain-
 *     language label "<Node> — <what it shows>" derived from the example's
 *     own `title`/`story`, so the grid is self-explanatory without opening
 *     anything. There is no note/comment node in the registry, and a Text
 *     panel's content only shows once its window is opened (it is not a
 *     'numbers'-family card-viewer type — src/raw/components/cardViewers/
 *     viewerKind.js), so a caption card would itself be an opened window
 *     sitting over the grid. The story lives in full in docs/nodes/*.md
 *     (generated from these same examples) and, short, in this label.
 *
 * Idempotent: every example's node/edge ids are deterministic
 * (src/project/graph/examples/nodes/helpers.js — `ex_<typeId>_<key>`), and
 * each createNode/createEdge op's `opId` IS that node/edge id, so
 * submitting the same family twice creates nothing twice — serverXR's own
 * idempotency guard (serverXR/src/routes/projectRoutes.js,
 * "existingOpIds") drops any op whose opId it has already applied,
 * regardless of op type. A re-run whose layout changed (an example's
 * build() grew a card, GRID_COLS changed, a family got re-split) ALSO sends
 * one `updateNode` per node, opId content-addressed on that node's target
 * graphX/graphY/label (moveOpId, below) — unchanged since last push, that
 * opId already exists and is dropped (no duplicate history entry, no-op);
 * changed, it is a NEW opId, so the guard lets it through and the node is
 * MOVED to its new cell rather than left in its old spot or duplicated.
 *
 * Usage:
 *   node scripts/push-node-examples.mjs --base <url> --space <id> [--token <token>]
 *       [--family <id>] [--cols <n>] [--dry-run]
 *
 *   --base accepts either a site root or a root already carrying
 *   /serverXR — normalizeBase probes /serverXR/api/health first, then
 *   /api/health, and uses whichever answers (see normalizeBase below).
 *
 * This script is NEVER run against a live install from an agent session —
 * only the lead runs it, against a real space, after review.
 */
import process from 'node:process'

import { NODE_EXAMPLE_FAMILIES } from '../src/project/graph/examples/nodes/index.js'
import { GRID_COLS, chunkFamily, buildChunkOps, slugFor, titleFor } from '../src/project/graph/examples/nodes/layout.js'

const parseArgs = (argv) => {
    const args = { base: null, space: null, token: null, family: null, cols: null, dryRun: false }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '--base') { args.base = argv[++i]; continue }
        if (arg === '--space') { args.space = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--family') { args.family = argv[++i]; continue }
        if (arg === '--cols') { args.cols = Number(argv[++i]); continue }
        if (arg === '--dry-run') { args.dryRun = true; continue }
    }
    return args
}

// Grid layout (chunking, cell sizing, captions) lives in layout.js, pure
// and unit-tested (layout.test.js) — imported above.

// --- base URL normalisation ---------------------------------------------

const probeHealth = async (base, fetchImpl) => {
    try {
        const response = await fetchImpl(`${base}/api/health`)
        return response.ok
    } catch {
        return false
    }
}

/**
 * Accept `--base` with or without a trailing `/serverXR`. Try
 * `<base>/serverXR/api/health` first; if that answers, the API root is
 * `<base>/serverXR`. Otherwise try `<base>/api/health`; if that answers,
 * `<base>` IS already the API root (this also covers a `--base` that
 * already ends in `/serverXR` — the first probe becomes `.../serverXR/
 * serverXR/api/health`, 404s, and the second probe finds it). Neither
 * answering is a hard error: no guessing which one the caller meant.
 */
export const normalizeBase = async (rawBase, { fetchImpl = fetch } = {}) => {
    const trimmed = rawBase.replace(/\/+$/, '')
    const withServerXR = `${trimmed}/serverXR`
    if (await probeHealth(withServerXR, fetchImpl)) return withServerXR
    if (await probeHealth(trimmed, fetchImpl)) return trimmed
    throw new Error(`Could not reach di.iiii's API from "${trimmed}" — tried ${withServerXR}/api/health and ${trimmed}/api/health`)
}

// --- push ----------------------------------------------------------------

const buildHeaders = (token) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
}

const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, options)
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, body }
}

/** Create a chunk's project, or find it if it already exists (409). */
const ensureProject = async (base, spaceId, chunk, headers) => {
    const slug = slugFor(chunk)
    const created = await apiFetch(`${base}/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug, title: titleFor(chunk) })
    })
    if (created.ok) return slug
    if (created.status === 409) return slug // already exists — same slug, same id
    throw new Error(`create project "${slug}" failed: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`)
}

const pushChunk = async (base, spaceId, chunk, headers, { dryRun, cols }) => {
    const ops = buildChunkOps(chunk, { cols })
    const label = titleFor(chunk)
    console.log(`  [${chunk.familyId}${chunk.total > 1 ? ` ${chunk.index}/${chunk.total}` : ''}] ${chunk.examples.length} examples, ${ops.length} ops -> "${label}"`)
    if (dryRun) return

    const projectId = await ensureProject(base, spaceId, chunk, headers)

    const doc = await apiFetch(`${base}/api/projects/${projectId}/document`, { headers })
    if (!doc.ok) throw new Error(`read "${projectId}" failed: HTTP ${doc.status}`)
    let baseVersion = Number(doc.body?.version) || 0

    // One retry on a version conflict (someone else wrote to this project
    // between the read above and this submit) — re-read and resubmit once,
    // then give up loudly rather than looping.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await apiFetch(`${base}/api/projects/${projectId}/ops`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ baseVersion, ops })
        })
        if (result.ok) {
            console.log(`  [${chunk.familyId}] -> ${projectId} @ v${result.body?.newVersion}`)
            return
        }
        if (result.status === 409 && attempt === 0) {
            baseVersion = Number(result.body?.latestVersion) || baseVersion
            continue
        }
        throw new Error(`push "${projectId}" failed: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 200)}`)
    }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (!args.base || !args.space) {
        console.error('Usage: node scripts/push-node-examples.mjs --base <url> --space <id> [--token <token>] [--family <id>] [--cols <n>] [--dry-run]')
        process.exitCode = 1
        return
    }
    const families = args.family
        ? NODE_EXAMPLE_FAMILIES.filter((family) => family.id === args.family)
        : NODE_EXAMPLE_FAMILIES
    if (!families.length) {
        console.error(`No family "${args.family}". Known families: ${NODE_EXAMPLE_FAMILIES.map((f) => f.id).join(', ')}`)
        process.exitCode = 1
        return
    }
    const cols = Number.isFinite(args.cols) && args.cols > 0 ? args.cols : GRID_COLS

    const base = await normalizeBase(args.base)
    const headers = buildHeaders(args.token)

    console.log(`[push-node-examples] space=${args.space} -> ${base}${args.dryRun ? ' (dry-run)' : ''}`)
    for (const family of families) {
        for (const chunk of chunkFamily(family)) {
            await pushChunk(base, args.space, chunk, headers, { dryRun: args.dryRun, cols })
        }
    }
    console.log('[done]')
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exitCode = 1
    })
}
