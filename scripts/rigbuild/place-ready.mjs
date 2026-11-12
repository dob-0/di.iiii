#!/usr/bin/env node
/**
 * place-ready.mjs: ONE read-only check of the whole chain of a place's project, so a gap is named at the start and not found later
 * by the owner (N3921: "I open the light desk and there is no patch"). Nothing is written, no desk output changes.
 *
 *   node scripts/rigbuild/place-ready.mjs --api <api> --project <id> --space <space> [--tree <di tree that serves the room>]
 *
 * Checks, each PASS / FAIL / OWED with the one command that fixes it (exit 1 on any FAIL):
 *   desk-show     the desk holds this space's show            -> node scripts/rigbuild/desk-load.mjs --project P --space S --apply (window)
 *   desk-patch    every lamp of the document is patched at its address
 *   desk-looks    every look has values for every lamp of a known channel list (lamps of a type whose chart is OWED are listed as OWED)
 *   desk-cues     the desk's runner holds this project's cue list (same count)
 *   room-view     the room opens in the front view (entryView fixed-camera), not the bird view
 *   bar-shape     every pixel bar keeps beam.emitter (an older di strips it: bars draw as dots)
 *   wall          the surface source exists as a node and the room has the live wall plane
 *   deck-columns  every deck column cue id exists in the cue list
 *   models        (with --tree) the tree holds the glb of every lamp type the document uses
 * Lessons it came from: docs/ai/lessons/platina-chain.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const lampsOf = (doc) => (doc.entities || []).filter((e) => e.components?.fixture?.type)
const row = (name, status, detail, fix = '') => ({ name, status, detail, fix })

/** Pure: the document, what the desk answers and (optionally) the library's owed types in, the rows out. */
export const checkChain = ({ doc, project, space, show, rig, looks, summary, tree = null, owedTypes = [] }) => {
    const out = []
    const lamps = lampsOf(doc)
    out.push(show?.space === space
        ? row('desk-show', 'PASS', `the desk holds ${space}`)
        : row('desk-show', 'FAIL', `the desk holds ${show?.space ?? 'nothing'}, not ${space}`, `node scripts/rigbuild/desk-load.mjs --project ${project} --space ${space} --backup-dir <dir> --apply   (a di-ask window)`))
    const fixtures = rig?.fixtures || []
    const patched = new Set(fixtures.map((f) => String(f.key || '').split(':').slice(1).join(':')))
    const unpatched = lamps.filter((l) => !patched.has(l.id)).map((l) => l.id)
    out.push(unpatched.length === 0 && fixtures.length > 0
        ? row('desk-patch', 'PASS', `${fixtures.length} of ${lamps.length} lamps patched`)
        : row('desk-patch', 'FAIL', `${unpatched.length} of ${lamps.length} lamps not on the desk (${unpatched.slice(0, 4).join(', ')})`, `node scripts/rigbuild/patch.mjs --project ${project} --exact`))
    const valued = new Set((looks || []).flatMap((l) => Object.keys(l.steps?.[0]?.values || {})))
    const typeOfDesk = new Map(fixtures.map((f) => [f.id, String(f.profile || '').split(' ')[0].toLowerCase()]))
    const empty = fixtures.filter((f) => !valued.has(f.id))
    const owed = empty.filter((f) => owedTypes.includes(typeOfDesk.get(f.id)))
    const bad = empty.filter((f) => !owedTypes.includes(typeOfDesk.get(f.id)))
    out.push(bad.length ? row('desk-looks', 'FAIL', `${bad.length} lamps get no value in any look (${bad.slice(0, 3).map((f) => f.name).join(', ')})`, `epic-build.mjs --desk-only for ${project}`)
        : owed.length ? row('desk-looks', 'OWED', `${owed.length} lamps have no channel list yet (maker chart behind a login), ${valued.size} lamps carry values`)
            : row('desk-looks', 'PASS', `${valued.size} lamps carry values`))
    const cues = doc.mappingState?.cues || []
    out.push(summary?.cues?.project === project && summary.cues.n === cues.length
        ? row('desk-cues', 'PASS', `runner holds ${summary.cues.n} cues of ${project}`)
        : row('desk-cues', 'FAIL', `runner holds ${summary?.cues?.n ?? 0} cues of ${summary?.cues?.project ?? 'no project'}, the document has ${cues.length}`, `epic-build.mjs --desk-only for ${project}`))
    out.push(doc.presentationState?.entryView === 'fixed-camera'
        ? row('room-view', 'PASS', 'the room opens in the fixed front view')
        : row('room-view', 'FAIL', `the room opens as "${doc.presentationState?.entryView}" (the bird view)`, `node scripts/rigbuild/stage-join.mjs --from-file <the good room's saved document> --view ... (a di-ask window)`))
    const bars = lamps.filter((l) => /pixel/.test(l.id))
    const bare = bars.filter((l) => !l.components?.beam?.emitter)
    out.push(bare.length ? row('bar-shape', 'FAIL', `${bare.length} of ${bars.length} pixel bars have no emitter shape (they draw as dots)`, 'install a di whose schema keeps beam.emitter, then re-send the beam components')
        : row('bar-shape', 'PASS', `${bars.length} bars keep their shape`))
    const surf = (doc.mappingState?.surfaces || []).find((s) => s.source?.kind === 'network')
    const node = surf && (doc.nodes || []).some((n) => n.id === surf.source.ref)
    const plane = (doc.entities || []).some((e) => /-live$/.test(e.id))
    out.push(node && plane ? row('wall', 'PASS', `surface ${surf.name} reads node ${surf.source.ref.slice(0, 8)}, live wall plane present`)
        : row('wall', 'FAIL', `${!surf ? 'no network surface' : !node ? 'the surface source node is gone' : 'no live wall plane'}`, 'node scripts/rigbuild/stage-join.mjs (adds the plane)'))
    const deck = (doc.nodes || []).find((n) => n.typeId === 'vj.deck')?.values?.deck
    const ids = new Set(cues.map((c) => c.id))
    const wrong = (deck?.columnCues || []).filter((c) => c && !ids.has(c))
    out.push(!deck?.columnCues ? row('deck-columns', 'FAIL', 'no column cues on the deck', 'node scripts/rigbuild/deck-columns-write.mjs ... --apply')
        : wrong.length ? row('deck-columns', 'FAIL', `${wrong.length} column cue ids are not cues (${wrong.slice(0, 3).join(', ')})`, 'node scripts/rigbuild/deck-columns-write.mjs ... --apply')
            : row('deck-columns', 'PASS', `${deck.columnCues.filter(Boolean).length} columns carry a cue`))
    if (tree) {
        const types = [...new Set(lamps.map((l) => l.components.fixture.type))]
        const missing = types.filter((t) => !tree.glbTypes.has(t))
        out.push(missing.length ? row('models', 'FAIL', `the serving tree lacks the lamp model of ${missing.join(', ')} (lamps draw as stand-ins)`, 'serve the room from a tree that has the Platina lamp models (e.g. integrate/deck-round-4, feat/platina-lights)')
            : row('models', 'PASS', `all ${types.length} lamp types have their model in the tree`))
    }
    return out
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const space = String(args.space || die('needs --space'))
    const light = api.replace(/\/serverXR$/, '') + '/light'
    const g = await makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null)).get(`/api/projects/${project}/document`)
    if (!g.ok) die(`${project}: ${g.status}`)
    const desk = makeClient(light, null)
    const get = async (p) => { const r = await desk.get(p); return r.ok ? r.body : null }
    const show = await get('/api/show')
    const rig = await get(`/api/rig?project=${encodeURIComponent(project)}`)
    const looks = (await get('/api/looks'))?.looks || []
    const summary = await get('/api/summary')
    let tree = null
    const root = args.tree ? path.resolve(String(args.tree)) : null
    const lib = await import('./library.mjs').then((m) => m.loadLibrary()).catch(() => null)
    const types = lib ? (Array.isArray(lib.types || lib) ? (lib.types || lib) : Object.values(lib.types || lib)) : []
    const owedTypes = types.filter((t) => t.makerChart && Object.values(t.makerChart.modes || {}).every((v) => v === 'OWED')).map((t) => String(t.code || t.id).toLowerCase())
    if (root) tree = { glbTypes: new Set(types.filter((t) => t.model3d?.glb && fs.existsSync(path.join(root, t.model3d.glb))).map((t) => t.id)) }
    const rows = checkChain({ doc: g.body.document, project, space, show, rig, looks, summary, tree, owedTypes })
    for (const r of rows) say(`${r.status.padEnd(5)} ${r.name.padEnd(13)} ${r.detail}${r.status === 'PASS' ? '' : `\n      fix: ${r.fix || 'owed, see the library'}`}`)
    const fails = rows.filter((r) => r.status === 'FAIL').length
    say(`place-ready ${project}: ${rows.filter((r) => r.status === 'PASS').length} pass, ${rows.filter((r) => r.status === 'OWED').length} owed, ${fails} fail`)
    if (fails) process.exit(1)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(e.message))
