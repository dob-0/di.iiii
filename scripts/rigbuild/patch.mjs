#!/usr/bin/env node
/**
 * patch.mjs — auto-patch a whole project from the terminal. docs/architecture/RIG_BUILD.md §4.
 *
 *   node scripts/rigbuild/patch.mjs --project <id> [--api <base>] [--desk <base>]
 *        [--group] [--repatch] [--dry-run] [--token-file <path>]
 *   node scripts/rigbuild/patch.mjs --project <id> --exact     # the document's addresses ARE the patch
 *   node scripts/rigbuild/patch.mjs --project <id> --unpatch   # take this room's fixtures off the desk
 *
 * Reads the project document, sends its lamps (entities with components.fixture.type)
 * to the desk's POST /light/api/rig/patch, and writes the desk's answer back as ops at
 * the document's current version — the same path the Studio takes, so what this does
 * is what the Studio shows. Prints the flags. `--dry-run` asks the desk nothing and
 * prints the request.
 *
 *   --api    di.iiii API (default https://local.thedi.studio/serverXR)
 *   --desk   the desk (default: the API's origin + /light/)
 *
 * --exact (RIG_BUILD.md §19): for a PLANNED patch (patch-plan.mjs wrote every lamp's
 * universe, address and fixture number into the document). The room's fixtures come off
 * the desk and go back at exactly the document's addresses and numbers; a lamp whose
 * address is taken by something else on the desk is REFUSED and flagged, never moved to
 * the next free address, and the run exits 1. A lamp with no address is refused too.
 * --unpatch: this room's fixtures come off the desk; the document is not changed (its
 * addresses stay what was planned for it). Used when another version of the same show
 * takes the desk (the desk runs one patch per space).
 */
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn } from '../place/common.mjs'
import { autoPatch, patchRequest, writeBackOps } from '../../src/rigbuild/autoPatch.js'
import { loadLibrary } from './library.mjs'

const args = parseArgs()

const main = async () => {
    const project = args.project ? String(args.project) : die('patch.mjs needs --project <id>.')
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const desk = String(args.desk || `${new URL(api).origin}/light/`).replace(/\/?$/, '/')
    const token = readToken(args['token-file'] ? String(args['token-file']) : null)
    const client = makeClient(api, token)
    const library = loadLibrary()
    const read = await client.get(`/api/projects/${project}/document`)
    if (!read.ok) die(`reading ${project} failed — HTTP ${read.status}`, read.text.slice(0, 300))
    const entities = read.body.document?.entities || []
    const post = (route, body) => fetch(desk + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (args.unpatch) {
        if (args['dry-run']) return say(`dry run: would take ${project}'s fixtures off ${desk}`)
        const r = await post('api/rig/patch', { project, lamps: [], prune: true })
        if (!r.ok) die(`the desk at ${desk} refused (${r.status})`, (await r.text()).slice(0, 300))
        const out = await r.json()
        return say(`${(out.removed || []).length} fixture${(out.removed || []).length === 1 ? '' : 's'} of ${project} taken off the desk; the document is unchanged.`)
    }
    if (args.exact) return exact({ project, entities, library, client, token, version: Number(read.body.version) || 0, post, desk })
    const options = { group: !!args.group, repatch: !!args.repatch, prune: !args.repatch }
    if (args['dry-run']) {
        say(JSON.stringify(patchRequest({ projectId: project, entities, library, ...options }), null, 2))
        return
    }
    let pending = []
    const out = await autoPatch({
        projectId: project, entities, library, ...options,
        post: (route, body) => fetch(desk + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        applyOps: (ops) => { pending = ops }
    })
    if (!out.ok) die(`the desk at ${desk}: ${out.message}`)
    for (const f of out.result.flags || []) warn(`  flag ${f.code.padEnd(14)} ${f.key}  ${f.message}`)
    if (!pending.length) return say(`${out.message}; the document already agrees.`)
    if (!token) die('No API token found, so nothing was written back.', 'Set DI_API_TOKEN or pass --token-file.')
    const write = await client.post(`/api/projects/${project}/ops`, { baseVersion: Number(read.body.version) || 0, ops: pending })
    if (!write.ok) die(`writing back failed — HTTP ${write.status}`, write.text.slice(0, 300))
    say(`${out.message}; ${pending.length} lamp${pending.length === 1 ? '' : 's'} written back.`)
}

/** The document's addresses are the patch: off the desk, then back exactly there. */
async function exact({ project, entities, library, client, token, version, post, desk }) {
    const body = patchRequest({ projectId: project, entities, library, prune: true })
    const unaddressed = body.lamps.filter((l) => !(Number.isInteger(l.universe) && Number.isInteger(l.address)))
    if (unaddressed.length) die(`--exact: ${unaddressed.length} lamp(s) have no address in the document (${unaddressed.slice(0, 5).map((l) => l.key).join(', ')}) — run patch-plan.mjs first`)
    if (args['dry-run']) { say(JSON.stringify(body, null, 2)); return }
    const off = await post('api/rig/patch', { project, lamps: [], prune: true })
    if (!off.ok) die(`the desk at ${desk} refused the clear (${off.status})`)
    const r = await post('api/rig/patch', body)
    if (!r.ok) die(`the desk at ${desk} refused the patch (${r.status})`, (await r.text()).slice(0, 300))
    const result = await r.json()
    const flags = result.flags || []
    for (const f of flags) warn(`  flag ${f.code.padEnd(14)} ${f.key}  ${f.message}`)
    const moved = (result.assignments || []).filter((a) => {
        const l = body.lamps.find((x) => x.key === a.key)
        return l && (l.universe !== a.universe || l.address !== a.address || (l.index != null && l.index !== a.index))
    })
    for (const a of moved) warn(`  the desk put ${a.key} at #${a.index} U${a.universe}.${String(a.address).padStart(3, '0')}, not where the document says`)
    const ops = writeBackOps({ projectId: project, entities, library, result })
    if (ops.length) {
        if (!token) die('No API token found, so nothing was written back.')
        const write = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops })
        if (!write.ok) die(`writing back failed — HTTP ${write.status}`, write.text.slice(0, 300))
    }
    const n = (result.assignments || []).length
    say(`${n} of ${body.lamps.length} lamps on the desk at the document's addresses${ops.length ? `; ${ops.length} written back` : ''}.`)
    if (flags.length || moved.length || n !== body.lamps.length) die(`--exact: ${flags.length} flagged, ${moved.length} not where planned — fix the plan or the desk, nothing was moved to "next free".`)
}

main().catch((error) => die(error.message))
