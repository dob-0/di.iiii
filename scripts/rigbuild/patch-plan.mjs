#!/usr/bin/env node
/**
 * patch-plan.mjs — write a show's PLANNED patch into its project document.
 * docs/architecture/RIG_BUILD.md §19.
 *
 *   node scripts/rigbuild/patch-plan.mjs --plan scripts/place/rigs/moxir-2026-10-17-minimal.patch.json \
 *        [--project <id>] [--api <base>] [--token-file <f>] [--dry-run] [--keep-circuits]
 *
 * Reads the document, lays every lamp out as the plan says (src/rigbuild/patchPlan.js:
 * universe per data run, blocks on round starts, fixture numbers, mode per type, unit,
 * position, hung), proposes circuits position by position (sheet.js assignCircuits, one
 * 16 A circuit never spans two positions) unless --keep-circuits, and writes it all as
 * ONE batch of ops at the document's version — undo-able, in the op log. A plan that does
 * not fit (overlap, past 512, a lamp in no block, a fixture number twice) is an error:
 * nothing is written. Then make the desk agree:
 *   node scripts/rigbuild/patch.mjs --project <id> --exact
 */
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn, REPO_ROOT } from '../place/common.mjs'
import { planPatch } from '../../src/rigbuild/patchPlan.js'
import { assignCircuits } from '../../src/rigbuild/sheet.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const args = parseArgs()

/** The fixture ops a plan gives, circuits included. Pure. */
export const planOps = ({ entities, library, plan, keepCircuits = false }) => {
    const r = planPatch({ entities, library, plan })
    if (r.errors.length) return { ...r, allOps: [] }
    // Circuits are proposed on the room AS PLANNED (positions and units are the plan's).
    const byId = new Map(r.ops.map((op) => [op.payload.entityId, op.payload.patch]))
    const planned = entities.map((e) => {
        const patch = byId.get(e.id)
        return patch ? { ...e, components: { ...e.components, fixture: { ...e.components.fixture, ...patch } } } : e
    })
    const circuitOps = keepCircuits ? [] : assignCircuits({ entities: planned, library, replace: true })
        .filter((op) => planned.find((e) => e.id === op.payload.entityId)?.components?.fixture?.circuit !== op.payload.patch.circuit)
    const merged = new Map()
    for (const op of [...r.ops, ...circuitOps]) {
        const id = op.payload.entityId
        merged.set(id, { ...(merged.get(id) || {}), ...op.payload.patch })
    }
    const allOps = [...merged].map(([entityId, patch]) => ({ type: 'updateComponent', payload: { entityId, component: 'fixture', patch } }))
    return { ...r, allOps }
}

const main = async () => {
    const planFile = args.plan ? path.resolve(REPO_ROOT, String(args.plan)) : die('needs --plan <file.patch.json>')
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'))
    const project = String(args.project || plan.project || '') || die('needs --project (or "project" in the plan)')
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const token = readToken(args['token-file'] ? String(args['token-file']) : null)
    const client = makeClient(api, token)
    const read = await client.get(`/api/projects/${project}/document`)
    if (!read.ok) die(`reading ${project} failed — HTTP ${read.status}`)
    const entities = read.body.document?.entities || []
    const library = libraryWithShow(loadLibrary(), entities)
    const r = planOps({ entities, library, plan, keepCircuits: Boolean(args['keep-circuits']) })
    for (const e of r.errors) warn(`  ERROR ${e}`)
    if (r.errors.length) die(`the plan does not fit ${project}: ${r.errors.length} error(s), nothing written`)
    for (const w of r.warnings) warn(`  warning ${w}`)
    for (const u of r.universes) say(`  U${u.universe} port ${u.port || '—'}  ${String(u.lamps).padStart(2)} lamps  ${String(u.used).padStart(3)} ch used  ${u.free} free   ${u.label}`)
    say(`${r.assignments.length} lamps planned; ${r.allOps.length} to change`)
    if (!r.allOps.length) return say('the document already agrees with the plan')
    if (args['dry-run']) {
        for (const op of r.allOps) say(`  ${op.payload.entityId.padEnd(28)} ${JSON.stringify(op.payload.patch)}`)
        return say(`dry run: ${r.allOps.length} ops not written`)
    }
    if (!token) die('no API token (DI_API_TOKEN or --token-file)')
    const stamp = Date.now()
    const write = await client.post(`/api/projects/${project}/ops`, {
        baseVersion: Number(read.body.version) || 0,
        ops: r.allOps.map((op, i) => ({ ...op, opId: `patch-plan-${stamp}-${i}`, clientId: 'patch-plan' }))
    })
    if (!write.ok) die(`writing failed — HTTP ${write.status}`, write.text.slice(0, 300))
    say(`${r.allOps.length} lamps written (version ${write.body.newVersion ?? '?'}). Next: node scripts/rigbuild/patch.mjs --project ${project} --exact`)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(e.message))
