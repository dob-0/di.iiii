#!/usr/bin/env node
/**
 * Remove ONE node (and its edges) from a project, with a saved copy for the undo (owner N3885: a "Video" node lay as a
 * flat picture on the stage floor of the live deck project).
 *
 *   node scripts/rigbuild/node-remove.mjs --api <api> --project <id> --node <nodeId> [--backup-dir <dir>] [--apply]
 *   node scripts/rigbuild/node-remove.mjs --api <api> --project <id> --undo <saved.json> --apply
 *
 * Dry run by default. Refuses a node other nodes hang under, and a deck. The asset file is never touched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

/** What would go: the node and every edge that touches it; `why` is set when it must not be removed. Pure. */
export const planRemove = ({ document, nodeId }) => {
    const node = (document.nodes || []).find((n) => n.id === nodeId)
    if (!node) return { why: `no node ${nodeId}` }
    if (node.typeId === 'vj.deck') return { why: 'that node is the deck' }
    if ((document.nodes || []).some((n) => n.parentId === nodeId)) return { why: 'other nodes hang under it' }
    const edges = (document.edges || []).filter((e) => e.fromNodeId === nodeId || e.toNodeId === nodeId)
    return { node, edges }
}
export const removeOps = (plan) => [{ type: 'deleteNode', payload: { nodeId: plan.node.id } }]
export const restoreOps = (saved) => [
    { type: 'createNode', payload: { node: saved.node } },
    ...(saved.edges || []).map((edge) => ({ type: 'createEdge', payload: { edge } }))
]

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const read = async () => { const g = await client.get(`/api/projects/${project}/document`); if (!g.ok) die(`${project}: ${g.status}`); return g.body }
    const post = async (ops, tag) => {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: (await read()).version, ops: ops.map((op, i) => ({ ...op, opId: `node-remove-${tag}-${Date.now()}-${i}`, clientId: 'node-remove' })) })
        if (!out.ok) die(`${project}: ops: ${out.status} ${String(out.text || '').slice(0, 200)}`)
    }
    const count = (d) => `nodes ${d.nodes.length} edges ${(d.edges || []).length}`
    if (args.undo) {
        const saved = JSON.parse(fs.readFileSync(String(args.undo), 'utf8'))
        if (!args.apply) return say(`${project}: would put back node ${saved.node.id} and ${saved.edges.length} edges (dry run)`)
        await post(restoreOps(saved), 'undo')
        return say(`${project}: put back, now ${count((await read()).document)}`)
    }
    const before = await read()
    const nodeId = String(args.node || die('needs --node'))
    const plan = planRemove({ document: before.document, nodeId })
    if (plan.why) die(`${project}: not removed: ${plan.why}`)
    say(`${project} version ${before.version}: ${count(before.document)}; would remove node ${nodeId} (${plan.node.typeId} "${plan.node.label}") and ${plan.edges.length} edges`)
    if (!args.apply) return say('dry run: nothing written (--apply writes)')
    const dir = path.resolve(String(args['backup-dir'] || die('--apply needs --backup-dir')))
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${project}-node-${nodeId.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, JSON.stringify({ project, api, node: plan.node, edges: plan.edges }, null, 1))
    await post(removeOps(plan), 'remove')
    const after = await read()
    const gone = !after.document.nodes.some((n) => n.id === nodeId)
    say(`${project} version ${after.version}: ${count(after.document)}; ${gone ? 'NODE REMOVED' : 'NODE STILL THERE'}; undo: --undo ${file} --apply`)
    if (!gone) process.exit(1)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(String(e?.stack || e)))
