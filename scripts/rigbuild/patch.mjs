#!/usr/bin/env node
/**
 * patch.mjs — auto-patch a whole project from the terminal. docs/architecture/RIG_BUILD.md §4.
 *
 *   node scripts/rigbuild/patch.mjs --project <id> [--api <base>] [--desk <base>]
 *        [--group] [--repatch] [--dry-run] [--token-file <path>]
 *
 * Reads the project document, sends its lamps (entities with components.fixture.type)
 * to the desk's POST /light/api/rig/patch, and writes the desk's answer back as ops at
 * the document's current version — the same path the Studio takes, so what this does
 * is what the Studio shows. Prints the flags. `--dry-run` asks the desk nothing and
 * prints the request.
 *
 *   --api    di.iiii API (default https://local.thedi.studio/serverXR)
 *   --desk   the desk (default: the API's origin + /light/)
 */
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn } from '../place/common.mjs'
import { autoPatch, patchRequest } from '../../src/rigbuild/autoPatch.js'
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

main().catch((error) => die(error.message))
