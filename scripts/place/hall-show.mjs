#!/usr/bin/env node
/**
 * hall-show.mjs — the SHOW copy of a hall: the same model without the planning marks.
 *
 * hall.py draws the zones the owner marked (the dance floor — "his blue" —, the stage, the
 * backstage) as emissive floor tape (`hall-zone-*` meshes), so the plot and the build views
 * can be read against them. In a room where a SHOW plays they are not there in the real
 * hall and they glow bright blue and green on a black floor: the first thing the eye reads
 * in an underground set (seen 2026-09-28 on /moxir, the Minimal version's live loop).
 *
 *   node scripts/place/hall-show.mjs --in hall.glb --out hall-show.glb          # offline
 *   node scripts/place/hall-show.mjs --in hall.glb --out hall-show.glb \
 *       --api https://local.thedi.studio/serverXR --project moxir-hall-minimal --token-file ~/.di/di.env
 *
 * With --api it uploads the copy to the project and points its hall entity (`place-hall`)
 * at it — one op; the planning project (moxir-hall) keeps the tape. Nothing else in the
 * model changes: nodes are removed whole, every other mesh keeps its bytes' meaning.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'

import { parseArgs, die, say } from './common.mjs'
import { makeClient } from './api.mjs'

const args = parseArgs()
export const PLANNING_MESH = /^hall-zone-/

/** Remove every node whose mesh is a planning mark; returns the names removed. */
export const stripPlanningMarks = (doc) => {
    const removed = []
    for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh()
        const name = mesh?.getName() || node.getName()
        if (mesh && PLANNING_MESH.test(name)) {
            removed.push(name)
            node.dispose()
        }
    }
    return removed
}

const main = async () => {
    const input = path.resolve(String(args.in || die('needs --in <hall.glb>')))
    const output = path.resolve(String(args.out || die('needs --out <hall-show.glb>')))
    const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRMaterialsEmissiveStrength])
    const doc = await io.read(input)
    const removed = stripPlanningMarks(doc)
    if (!removed.length) die(`no planning marks (${PLANNING_MESH}) in ${input}`)
    await doc.transform(prune())
    await io.write(output, doc)
    say(`${path.basename(output)}: removed ${removed.join(', ')} — ${fs.statSync(output).size} bytes (was ${fs.statSync(input).size})`)

    if (!args.api) return
    const api = String(args.api).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project with --api'))
    const tokenLine = fs.readFileSync(path.resolve(String(args['token-file'] || die('needs --token-file'))), 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    const client = makeClient(api, tokenLine ? tokenLine.slice('ADMIN_API_TOKEN='.length).trim() : die('no ADMIN_API_TOKEN'))
    const form = new FormData()
    form.append('asset', new Blob([fs.readFileSync(output)], { type: 'model/gltf-binary' }), 'hall-show.glb')
    const up = await client.post(`/api/projects/${project}/assets`, form)
    if (!up.ok) die(`upload: ${up.status} ${up.text.slice(0, 200)}`)
    const doc2 = await client.get(`/api/projects/${project}/document`)
    const hall = doc2.body.document.entities.find((e) => e.id === 'place-hall') || die(`${project} has no place-hall`)
    const was = hall.components?.media?.assetId
    // The asset goes into the document's list too (upsertAsset): the room finds a model's
    // bytes through document.assets — an uploaded file the list does not name draws nothing.
    const a = up.body.asset
    const asset = { id: a.id, name: a.name || 'hall-show.glb', mimeType: a.mimeType || 'model/gltf-binary', size: a.size || fs.statSync(output).size, url: a.url, source: 'server', createdAt: Date.now() }
    const ops = [
        { type: 'upsertAsset', payload: { asset } },
        { type: 'updateComponent', payload: { entityId: 'place-hall', component: 'media', patch: { assetId: a.id } } }
    ].map((op, i) => ({ ...op, opId: `hall-show-${Date.now()}-${i}`, clientId: 'hall-show' }))
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: doc2.body.version, ops })
    if (!out.ok) die(`pointing place-hall at it: ${out.status} ${out.text.slice(0, 200)}`)
    say(`${project}: place-hall now draws ${up.body.asset.id} (hall-show.glb); was ${was} — version ${out.body.newVersion}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
