#!/usr/bin/env node
/**
 * Which light cue each column of a project's VJ deck fires ("Lights follow", VjDeckView.jsx).
 *
 *   node scripts/deck-column-cues.mjs --api http://127.0.0.1:4321/serverXR --project ID --map 1=CUEID,2=CUEID [--token-file F] [--apply]
 *
 * Reads the project document, finds the VJ deck node (typeId vj.deck), checks that every cue id is in
 * mappingState.cues, prints the deck's columnCues before and after, and writes ONLY with --apply (one
 * updateNode op through POST /api/projects/ID/ops, the route scripts/rigbuild/epic-build.mjs uses).
 * Default is a dry run. Columns are 1-based here, as on the deck. A column not named in --map keeps what
 * it has. A cue id the project does not have is reported and that column is left as it was.
 * --node ID picks the deck when a project has more than one. Undo: run it again with the "before" list
 * (an empty id clears a column: --map 3=).
 * Scratch stacks on localhost / 127.0.0.1 only. It never calls the light desk.
 */
import { fileURLToPath } from 'node:url'
import { parseArgs, die, say } from './place/common.mjs'
import { makeClient, readToken } from './place/api.mjs'
import { normalizeDeck, setColumnCue } from '../src/project/tops/vjDeck.js'

/** "1=a,2=b" -> Map(column index 0-based -> id); throws on a malformed pair. */
export const parseMap = (text) => {
    const out = new Map()
    for (const pair of String(text || '').split(',').map((part) => part.trim()).filter(Boolean)) {
        const match = /^(\d+)=(.*)$/.exec(pair)
        if (!match || Number(match[1]) < 1) throw new Error(`bad pair "${pair}": use COLUMN=CUEID with COLUMN from 1`)
        out.set(Number(match[1]) - 1, match[2].trim())
    }
    return out
}

/** Pure: { node, before, after, problems } for a document and a column map. Nothing is written. */
export const planColumnCues = (doc, map, nodeId = null) => {
    const decks = (doc?.nodes || []).filter((node) => node?.typeId === 'vj.deck' && (!nodeId || node.id === nodeId))
    if (decks.length !== 1) throw new Error(decks.length ? `${decks.length} VJ deck nodes: pick one with --node ID (${decks.map((n) => n.id).join(', ')})` : 'no VJ deck node in this project')
    const node = decks[0]
    const cueIds = new Set((doc?.mappingState?.cues || []).map((cue) => cue?.id).filter(Boolean))
    const before = normalizeDeck(node.values?.deck)
    let after = before
    const problems = []
    for (const [column, id] of map) {
        if (column >= before.columns) { problems.push(`column ${column + 1}: the deck has ${before.columns} columns`); continue }
        if (id && !cueIds.has(id)) { problems.push(`column ${column + 1}: no cue "${id}" in this project, left as it was`); continue }
        after = setColumnCue(after, column, id)
    }
    return { node, before: before.columnCues, after: after.columnCues, deck: after, problems }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const api = String(args.api || '')
    const project = String(args.project || '')
    if (!api || !project || !args.map || args.map === true) die('usage: node scripts/deck-column-cues.mjs --api URL --project ID --map 1=CUEID,2=CUEID [--node ID] [--token-file F] [--apply]')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('deck-column-cues.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    let map
    try { map = parseMap(args.map) } catch (error) { die(error.message) }
    const client = makeClient(api, args['token-file'] ? readToken(String(args['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    let plan
    try { plan = planColumnCues(got.body.document, map, args.node ? String(args.node) : null) } catch (error) { die(error.message) }
    say(`${project} @ v${got.body.version}, deck node ${plan.node.id}`)
    say(`before: ${JSON.stringify(plan.before)}`)
    say(`after:  ${JSON.stringify(plan.after)}`)
    for (const problem of plan.problems) say(`!! ${problem}`)
    if (JSON.stringify(plan.before) === JSON.stringify(plan.after)) { say('nothing to change'); return }
    if (!args.apply) { say('dry run: nothing written (--apply to write)'); return }
    const op = { type: 'updateNode', opId: `deck-column-cues-${Date.now()}`, payload: { nodeId: plan.node.id, patch: { values: { ...plan.node.values, deck: plan.deck } } } }
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: [op] })
    if (!out.ok) die(`ops: ${out.status} ${String(out.text).slice(0, 300)}`)
    say(`written: 1 updateNode op, now v${out.body?.version ?? '?'}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
