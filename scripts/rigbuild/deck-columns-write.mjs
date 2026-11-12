#!/usr/bin/env node
/**
 * deck-columns-write.mjs: set which light cue each column of a project's VJ deck fires (the deck's "Lights follow", owner N3917/N3919).
 *
 *   node scripts/rigbuild/deck-columns-write.mjs --api <api> --project <id> [--map v2-07,v2-09,...] [--backup-dir <dir>] [--apply]
 *   node scripts/rigbuild/deck-columns-write.mjs --api <api> --project <id> --undo <saved.json> --apply
 *
 * --map: one cue id (or the start of one, e.g. v2-07) per column, in column order. Writes ONE updateNode op that changes only
 * values.deck.columnCues of the deck node; every other field of the deck is carried as it is. The saved file holds the deck before;
 * --undo puts it back. Dry run by default. The reading side (the Lights follow switch) is the deck chat's feat/deck-column-cue.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

export const DEFAULT_MAP = ['v2-07', 'v2-09', 'v2-05', 'v2-11', 'v2-13', 'v2-17', 'v2-03', 'v2-20']

/** The deck node, the column count and the cue ids a map resolves to. Pure; refuses a map entry that matches no cue or several. */
export const planColumns = ({ document, map = DEFAULT_MAP }) => {
    const node = (document.nodes || []).find((n) => n.typeId === 'vj.deck')
    if (!node) throw new Error('no vj.deck node in the project')
    const deck = node.values?.deck || {}
    const cues = (document.mappingState?.cues || []).map((c) => c.id)
    const count = Math.max(Number(deck.columns) || 0, Array.isArray(deck.columnCues) ? deck.columnCues.length : 0, map.length)
    const ids = map.map((m) => {
        if (!m) return ''
        const hit = cues.filter((id) => id === m || id.startsWith(`${m}-`))
        if (hit.length !== 1) throw new Error(`"${m}" matches ${hit.length} cues`)
        return hit[0]
    })
    const columnCues = Array.from({ length: count }, (_, i) => ids[i] || '')
    return { node, before: deck, deck: { ...deck, columnCues }, columnCues }
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`${project}: ${got.status}`)
    const post = async (node, deck, tag) => {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: [{ type: 'updateNode', opId: `deck-columns-${tag}-${Date.now()}`, clientId: 'deck-columns-write', payload: { nodeId: node.id, patch: { values: { ...node.values, deck } } } }] })
        if (!out.ok) die(`${project}: ops ${out.status} ${String(out.text || '').slice(0, 200)}`)
        return out.body?.version
    }
    if (args.undo) {
        const saved = JSON.parse(fs.readFileSync(String(args.undo), 'utf8'))
        const node = got.body.document.nodes.find((n) => n.id === saved.nodeId) || die('the deck node of the saved file is not in the project')
        if (!args.apply) return say(`dry run: would put the deck of ${node.id} back (columnCues ${JSON.stringify(saved.deck.columnCues ?? null)})`)
        return say(`undone, now v${await post(node, saved.deck, 'undo')}`)
    }
    const plan = planColumns({ document: got.body.document, map: args.map ? String(args.map).split(',') : DEFAULT_MAP })
    say(`${project} v${got.body.version}: deck ${plan.node.id}, ${plan.columnCues.length} columns; columnCues before ${JSON.stringify(plan.before.columnCues ?? null)}`)
    say(`would set: ${plan.columnCues.map((c, i) => `${i + 1}=${c || '-'}`).join(' ')}`)
    if (!args.apply) return say('dry run: nothing written (--apply writes)')
    const dir = path.resolve(String(args['backup-dir'] || die('--apply needs --backup-dir')))
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${project}-deck-before-columns-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, JSON.stringify({ nodeId: plan.node.id, deck: plan.before }))
    const v = await post(plan.node, plan.deck, 'set')
    say(`COLUMNS OK: v${v}; undo: --undo ${file} --apply`)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(e.message))
