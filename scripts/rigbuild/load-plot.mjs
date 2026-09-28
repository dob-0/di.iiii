#!/usr/bin/env node
/**
 * load-plot.mjs — put a rig document (moxir.mjs's output) into a project AS OPS, with
 * the venue's plan on the hall and the rig's truss and decks as real build pieces,
 * so the plot (/{space}/plot/{project}), the Studio and the patch sheet all read it.
 * docs/architecture/RIG_BUILD.md §10.
 *
 *   node scripts/rigbuild/load-plot.mjs --api http://localhost:4371/serverXR \
 *     --project moxir-hall --doc <moxir-rig.document.json> \
 *     --hall <hall.json> [--site <site.json>] [--venue-entity place-hall] \
 *     --token-file serverXR/.env.local [--dry-run] [--plan-only]
 *
 * What it writes, all through POST /api/projects/<id>/ops at the current version
 * (the op log is upstream of every view):
 *   1. updateComponent venuePlan on the venue entity — venuePlanFromHall(hall.json);
 *   2. the rig's goalpost and riser, which the rig script draws as boxes, as PIECES:
 *      each tower a `tower` stood on the floor to the header's height, the header a
 *      run of stock truss segments tower to tower (layRun), the riser tiled with
 *      2 x 1 m decks at its height — the bodies from scripts/rigbuild/pieces/*.glb,
 *      uploaded as project assets;
 *   3. every lamp and effect of the document (createEntity; an id already there is
 *      replaced), and deletes the old rig lamps and the BAKED beam, wash and body
 *      meshes (`rig-beams`, `rig-wash`, `rig-fixtures`), which the live lamps replace.
 *
 * Point it only at a stack you own: it never defaults to an address, and a token is
 * read from --token-file (never ~/.di/di.env, the installed di.iiii's).
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient, mimeFor } from '../place/api.mjs'
import { venuePlanFromHall } from '../../src/rigbuild/venuePlan.js'
import { layRun } from '../../src/rigbuild/plotGeometry.js'
import { PIECES, TRUSS_SECTION_M, catalogueHeightOf } from '../../src/rigbuild/pieces.js'

const args = parseArgs()
const BAKED = ['rig-beams', 'rig-wash', 'rig-fixtures']
const r3 = (v) => Math.round(v * 1000) / 1000

const readTokenFile = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

/**
 * The goalpost and riser boxes (rig-lib.mjs: `rig-truss-tower-*`, `rig-truss-header`,
 * `rig-stage-deck`, anchored on the floor at their centre) as piece poses.
 */
export const piecesFromRigBoxes = (entities) => {
    const byId = new Map(entities.map((e) => [e.id, e]))
    const out = []
    const header = byId.get('rig-truss-header')
    const towers = entities.filter((e) => /^rig-truss-tower-/.test(e.id))
    if (header && towers.length === 2) {
        const t = header.components.transform
        const chord = r3(t.position[1] + (t.scale[1] || TRUSS_SECTION_M) / 2)
        const [a, b] = [...towers].sort((p, q) => p.components.transform.position[0] - q.components.transform.position[0])
        const from = [a.components.transform.position[0], a.components.transform.position[2]]
        const to = [b.components.transform.position[0], b.components.transform.position[2]]
        const towerHeight = r3(chord - TRUSS_SECTION_M / 2)
        for (const [i, tw] of [a, b].entries()) {
            out.push({ id: `rig-tower-${i ? 'r' : 'l'}`, name: `goalpost tower ${i ? 'R' : 'L'}`, kind: 'tower', position: [...tw.components.transform.position], yaw: 0, height: towerHeight, replaces: tw.id })
        }
        layRun({ from, to, y: chord }).forEach((seg, i) => {
            out.push({ id: `rig-header-${i + 1}`, name: 'truss header', kind: seg.kind, position: seg.position, yaw: seg.yaw, height: null, replaces: i === 0 ? header.id : null })
        })
    }
    const riser = byId.get('rig-stage-deck')
    if (riser) {
        const t = riser.components.transform
        const [w, h, d] = t.scale
        // 2 x 1 decks, long side along the riser's depth when it is 2 m deep.
        const across = Math.abs(d - 2) < 1e-6 ? Math.round(w) : Math.round(d)
        const turned = Math.abs(d - 2) < 1e-6
        for (let i = 0; i < across; i++) {
            const off = -across / 2 + 0.5 + i
            const position = turned ? [r3(t.position[0] + off), 0, t.position[2]] : [t.position[0], 0, r3(t.position[2] + off)]
            out.push({ id: `rig-deck-${i + 1}`, name: 'DJ riser', kind: 'deck-2x1', position, yaw: turned ? r3(Math.PI / 2) : 0, height: h, replaces: i === 0 ? riser.id : null })
        }
    }
    return out
}

const main = async () => {
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('load-plot.mjs needs --api <base, e.g. http://localhost:4371/serverXR> — it has no default on purpose.')
    const projectId = String(args.project || die('needs --project <id>'))
    const doc = readJson(path.resolve(String(args.doc || die('needs --doc <moxir-rig.document.json>'))))
    const hallFile = path.resolve(String(args.hall || die('needs --hall <hall.json>')))
    const hall = readJson(hallFile)
    const site = args.site ? readJson(path.resolve(String(args.site))) : null
    const venueId = String(args['venue-entity'] || 'place-hall')
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file <env file with ADMIN_API_TOKEN>'))))
    if (!token) die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)

    const got = await client.get(`/api/projects/${projectId}/document`)
    if (!got.ok) die(`reading ${projectId}: ${got.status} ${got.text.slice(0, 200)}`)
    const current = got.body
    const have = new Map((current.document?.entities || []).map((e) => [e.id, e]))
    if (!have.has(venueId)) die(`no venue entity "${venueId}" in ${projectId}`)

    const plan = venuePlanFromHall(hall, { name: String(args.name || 'MOXIR · Charentsavan factory hall'), source: `scripts/place/rigs/${path.basename(hallFile)} (hall.py v${hall.version}, ${String(hall.createdAt || '').slice(0, 16)})`, site })
    const ops = [{ type: 'updateComponent', payload: { entityId: venueId, component: 'venuePlan', patch: plan } }]

    if (args['plan-only']) {
        const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: current.version, ops: ops.map((op, j) => ({ ...op, opId: `load-plot-${Date.now()}-${j}`, clientId: 'load-plot' })) })
        if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 300)}`)
        say(`${projectId}: venue plan only; the project is at version ${out.body.newVersion}`)
        return
    }

    // Pieces: upload each body once, then one model entity per piece.
    const pieces = piecesFromRigBoxes(doc.entities)
    const assetFor = {}
    for (const kind of new Set(pieces.map((p) => p.kind))) {
        const file = path.join(REPO_ROOT, 'scripts/rigbuild/pieces', `${kind}.glb`)
        if (args['dry-run']) { assetFor[kind] = { id: `dry-${kind}` }; continue }
        const form = new FormData()
        form.append('asset', new Blob([fs.readFileSync(file)], { type: mimeFor(file) }), `rigbuild-${kind}.glb`)
        const res = await fetch(`${api}/api/projects/${projectId}/assets`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
        if (!res.ok) die(`upload ${kind}: ${res.status} ${await res.text()}`)
        const { asset } = await res.json()
        assetFor[kind] = asset
        ops.push({ type: 'upsertAsset', payload: { asset } })
    }
    const replaced = new Set(pieces.map((p) => p.replaces).filter(Boolean))
    for (const id of ['rig-truss-tower-l', 'rig-truss-tower-r', 'rig-truss-header', 'rig-stage-deck']) if (doc.entities.some((e) => e.id === id)) replaced.add(id)
    for (const p of pieces) {
        const base = catalogueHeightOf(p.kind)
        ops.push({
            type: 'createEntity',
            payload: {
                entity: {
                    id: p.id, type: 'model', name: p.name,
                    components: {
                        transform: { position: p.position, rotation: [0, p.yaw, 0], scale: [1, base && p.height ? r3(p.height / base) : 1, 1] },
                        media: { assetId: assetFor[p.kind].id },
                        appearance: { color: '#8a8f98', opacity: 1 },
                        piece: { kind: p.kind }
                    }
                }
            }
        })
    }

    // The rig: out with the old lamps and the baked meshes, in with the typed ones.
    const incoming = doc.entities.filter((e) => !replaced.has(e.id))
    const incomingIds = new Set(incoming.map((e) => e.id))
    for (const [id, e] of have) {
        const oldRig = id.startsWith('rig-') && !incomingIds.has(id) && !pieces.some((p) => p.id === id)
        if (BAKED.includes(id) || (oldRig && e.type !== 'model') || replaced.has(id)) ops.push({ type: 'deleteEntity', payload: { entityId: id } })
    }
    for (const e of incoming) ops.push({ type: 'createEntity', payload: { entity: e } })

    say(`${projectId}: venue plan (${plan.columns.length} columns, ${plan.zones.length} zones), ${pieces.length} pieces, ${incoming.length} rig entities, ${ops.filter((o) => o.type === 'deleteEntity').length} deletions`)
    if (args['dry-run']) return
    let version = current.version
    for (let i = 0; i < ops.length; i += 100) {
        const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: version, ops: ops.slice(i, i + 100).map((op, j) => ({ ...op, opId: `load-plot-${Date.now()}-${i + j}`, clientId: 'load-plot' })) })
        if (!out.ok) die(`ops ${i}-${i + 100}: ${out.status} ${out.text.slice(0, 300)}`)
        version = out.body.newVersion
    }
    say(`written; the project is at version ${version}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}

export { PIECES }
