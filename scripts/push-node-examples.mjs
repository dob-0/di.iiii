#!/usr/bin/env node
/**
 * push-node-examples.mjs — put the per-node examples into a real di.iiii,
 * one project per family (e.g. "examples · numbers").
 *
 * Uses the same APIs the app itself uses (src/project/services/projectsApi.js):
 *   POST /api/spaces/:space/projects        {slug, title}   — create the project
 *   POST /api/projects/:project/ops         {baseVersion, ops} — place every node/edge
 *
 * Idempotent: every example's node/edge ids are deterministic
 * (src/project/graph/examples/nodes/helpers.js — `ex_<typeId>_<key>`), and
 * each op's `opId` IS that node/edge id, so submitting the same family twice
 * creates nothing twice — serverXR's own idempotency guard
 * (serverXR/src/routes/projectRoutes.js, "existingOpIds") drops ops it has
 * already applied. Re-running this script after an example changes UPDATES
 * the existing nodes in place via `updateNode`/`updateEdge`... except it
 * doesn't yet (see "known limit" below) — a changed example currently needs
 * the family's project deleted and recreated.
 *
 * Known limit: this script only ever CREATES. If an example's build()
 * changes shape after a first push (a different port wired, a moved card),
 * re-running submits createNode/createEdge for the (now different) ids that
 * already exist server-side unmodified, or — for ids that stayed the same —
 * gets silently dropped by the idempotency guard, leaving the OLD graph in
 * place. Delete the family's project first if you need a clean re-push.
 *
 * Usage:
 *   node scripts/push-node-examples.mjs --base <url> --space <id> [--token <token>] [--family <id>] [--dry-run]
 *
 * This script is NEVER run against a live install from an agent session —
 * only the lead runs it, against a real space, after review.
 */
import process from 'node:process'

import { NODE_EXAMPLE_FAMILIES } from '../src/project/graph/examples/nodes/index.js'

const parseArgs = (argv) => {
    const args = { base: null, space: null, token: null, family: null, dryRun: false }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '--base') { args.base = argv[++i]; continue }
        if (arg === '--space') { args.space = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--family') { args.family = argv[++i]; continue }
        if (arg === '--dry-run') { args.dryRun = true; continue }
    }
    return args
}

/** The project this family lands in — a stable, predictable slug. */
export const slugFor = (family) => `examples-${family.id}`
export const titleFor = (family) => `examples · ${family.label}`

// Every example in a family, laid out in its OWN small grid (COL/ROW,
// helpers.js) starting at (0, WORKSPACE_TOP) — fine alone, but stacking
// EIGHT-ish of them into one project without an offset would draw every
// example's cards on top of each other. BLOCK_HEIGHT is generous: the
// tallest single-example graph seen (a picture-family chain with a live
// preview card) is well under 1000 graph units tall.
const BLOCK_HEIGHT = 1000

const offsetNode = (node, dy) => ({ ...node, graphY: node.graphY + dy })

/**
 * Every createNode/createEdge op for one family, offset so its examples
 * stack top-to-bottom without overlapping. opId === the node/edge's own id
 * — the idempotency key.
 */
export const buildFamilyOps = (family) => {
    const ops = []
    family.examples.forEach((example, index) => {
        const dy = index * BLOCK_HEIGHT
        const { nodes, edges } = example.build()
        for (const node of nodes) {
            ops.push({ opId: node.id, type: 'createNode', payload: { node: offsetNode(node, dy) } })
        }
        for (const edge of edges) {
            ops.push({ opId: edge.id, type: 'createEdge', payload: { edge } })
        }
    })
    return ops
}

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

/** Create the family's project, or find it if it already exists (409). */
const ensureProject = async (base, spaceId, family, headers) => {
    const slug = slugFor(family)
    const created = await apiFetch(`${base}/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug, title: titleFor(family) })
    })
    if (created.ok) return slug
    if (created.status === 409) return slug // already exists — same slug, same id
    throw new Error(`create project "${slug}" failed: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`)
}

const pushFamily = async (base, spaceId, family, headers, { dryRun }) => {
    const ops = buildFamilyOps(family)
    console.log(`  [${family.id}] ${family.examples.length} examples, ${ops.length} ops`)
    if (dryRun) return

    const projectId = await ensureProject(base, spaceId, family, headers)

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
            console.log(`  [${family.id}] -> ${projectId} @ v${result.body?.newVersion}`)
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
        console.error('Usage: node scripts/push-node-examples.mjs --base <url> --space <id> [--token <token>] [--family <id>] [--dry-run]')
        process.exitCode = 1
        return
    }
    const base = args.base.replace(/\/+$/, '')
    const headers = buildHeaders(args.token)
    const families = args.family
        ? NODE_EXAMPLE_FAMILIES.filter((family) => family.id === args.family)
        : NODE_EXAMPLE_FAMILIES
    if (!families.length) {
        console.error(`No family "${args.family}". Known families: ${NODE_EXAMPLE_FAMILIES.map((f) => f.id).join(', ')}`)
        process.exitCode = 1
        return
    }

    console.log(`[push-node-examples] space=${args.space} -> ${base}${args.dryRun ? ' (dry-run)' : ''}`)
    for (const family of families) {
        await pushFamily(base, args.space, family, headers, { dryRun: args.dryRun })
    }
    console.log('[done]')
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exitCode = 1
    })
}
