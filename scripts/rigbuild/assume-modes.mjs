#!/usr/bin/env node
/**
 * assume-modes.mjs — switch a project's lamps to their ASSUMED test modes (or back).
 * docs/architecture/RIG_BUILD.md §19.1.
 *
 *   node scripts/rigbuild/assume-modes.mjs --project <id> [--api <base>] [--token-file <f>] [--dry-run]
 *   node scripts/rigbuild/assume-modes.mjs --project <id> --back      # to the maker's modes again
 *
 * Every lamp whose type carries an assumed mode (src/rigbuild/assumedProfiles.js) gets
 * `components.fixture.mode = type.assumedMode`; `--back` puts the type's real default
 * mode back (and removes the mode where the type has none, e.g. UP-PL5403 — owed). One
 * op per lamp, at the document's version: undo-able, in the op log. Then run
 *   node scripts/rigbuild/patch.mjs --project <id> --repatch --group
 * so the desk patches each lamp at its (new) footprint, and show-loop.mjs to put the
 * looks back on the desk with their DMX.
 */
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say } from '../place/common.mjs'
import { fixtureOps } from '../../src/rigbuild/plotEdits.js'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'

const args = parseArgs()

/** The ops that move each lamp to its assumed mode (or back). Pure. */
export const assumeOps = (entities, library, { back = false } = {}) => {
    const ops = []
    const counts = {}
    for (const e of entities) {
        const f = e?.components?.fixture
        if (!f?.type) continue
        const type = typeById(library, f.type)
        if (!type) continue
        const want = back ? (type.defaultMode || null) : (type.assumedMode || null)
        if (!back && !want) continue
        if ((f.mode || null) === want) continue
        ops.push(...fixtureOps([e.id], { mode: want }))
        const k = `${type.code} ${f.mode || '(none)'} → ${want || '(none)'}`
        counts[k] = (counts[k] || 0) + 1
    }
    return { ops, counts }
}

const main = async () => {
    const project = args.project ? String(args.project) : die('needs --project <id>')
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const token = readToken(args['token-file'] ? String(args['token-file']) : null)
    const client = makeClient(api, token)
    const read = await client.get(`/api/projects/${project}/document`)
    if (!read.ok) die(`reading ${project} failed — HTTP ${read.status}`)
    const entities = read.body.document?.entities || []
    const library = libraryWithShow(loadLibrary(), entities)
    const { ops, counts } = assumeOps(entities, library, { back: Boolean(args.back) })
    for (const [k, n] of Object.entries(counts)) say(`  ${String(n).padStart(3)} × ${k}`)
    if (!ops.length) return say('nothing to change')
    if (args['dry-run']) return say(`dry run: ${ops.length} ops not written`)
    if (!token) die('no API token (DI_API_TOKEN or --token-file)')
    const stamp = Date.now()
    const write = await client.post(`/api/projects/${project}/ops`, { baseVersion: Number(read.body.version) || 0, ops: ops.map((op, i) => ({ ...op, opId: `assume-modes-${stamp}-${i}`, clientId: 'assume-modes' })) })
    if (!write.ok) die(`writing failed — HTTP ${write.status}`, write.text.slice(0, 300))
    say(`${ops.length} lamps ${args.back ? 'back on the maker\'s modes' : 'on their ASSUMED test modes'} (version ${write.body.newVersion ?? '?'})`)
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main().catch((e) => die(e.message))
