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
 *     --token-file serverXR/.env.local [--dry-run] [--plan-only] [--pieces-only]
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
 *      replaced), and deletes the old rig lamps and the BAKED beam and body meshes
 *      (`rig-beams`, `rig-fixtures`), which the live lamps and the rooms' own bodies
 *      (src/rigbuild/RigBodies.jsx) replace. The baked column WASH (`rig-wash`) is KEPT:
 *      no live lamp replaces its light — the beam-only PARs light nothing, and the room
 *      read dark without it (preview 2026-09-28; re-bake with rig.mjs --wash-only).
 *
 * --pieces-only stops after 1 and 2 and REMOVES the rig's lamps and baked meshes (the wash
 * too: with no lamps there is nothing for it to be the light of) without
 * writing new ones: an empty rig on its truss and decks, for view C to deal the rental
 * list onto (RIG_BUILD.md §11). --doc may then be the project's own document (the rig
 * boxes it carries are what become pieces).
 *
 * Point it only at a stack you own: it never defaults to an address, and a token is
 * read from --token-file (never ~/.di/di.env, the installed di.iiii's).
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient, mimeFor } from '../place/api.mjs'
import { venuePlanFromHall } from '../../src/rigbuild/venuePlan.js'
import { layRun, trussSegments } from '../../src/rigbuild/plotGeometry.js'
import { PIECES, TRUSS_SECTION_M, catalogueHeightOf } from '../../src/rigbuild/pieces.js'
import { isWashEntityId } from '../../src/rigbuild/looks.js'
import { isMainModule } from '../lib/isMainModule.mjs'

const args = parseArgs()
// Baked meshes the live rig replaces, and the one it does not (see 3. above).
export const BAKED_REPLACED = ['rig-beams', 'rig-fixtures']
export const BAKED_KEPT = ['rig-wash']
// The single wash and the per-look ones (`rig-wash:<look>`, rig.mjs --wash-per-look, RIG_BUILD.md §15.13).
export const isBakedKept = (id) => BAKED_KEPT.includes(id) || isWashEntityId(id)
const isBaked = (id) => BAKED_REPLACED.includes(id) || isBakedKept(id)
const r3 = (v) => Math.round(v * 1000) / 1000

const readTokenFile = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

/**
 * Which of the project's entities go (step 3): the baked beams and bodies, the old rig
 * lamps and boxes the incoming document does not carry, and the boxes that became
 * pieces. The baked wash stays unless --pieces-only (then no lamp is left for it to be
 * the light of). Pure, so the rule is tested (rigBodies.test.js).
 */
export const deletions = ({ have, incomingIds, pieceIds, replaced, piecesOnly }) => {
    const out = []
    for (const [id, e] of have) {
        const oldRig = id.startsWith('rig-') && !incomingIds.has(id) && !pieceIds.has(id)
        const lamp = e.type === 'spotLight' || Boolean(e.components?.fixture)
        const drop = piecesOnly
            ? (isBaked(id) || replaced.has(id) || (oldRig && lamp))
            : (BAKED_REPLACED.includes(id) || (oldRig && e.type !== 'model' && !isBakedKept(id)) || replaced.has(id))
        if (drop) out.push(id)
    }
    return out
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
    // A line hung from the crane bridge (rig-lib `truss.kind: 'crane-hung'`): no towers, the
    // header box IS the line — laid as stock segments end to end at its chord height.
    const roll = header?.components?.transform?.rotation?.[2] || 0
    // The X lying down (rig-lib `truss.kind: 'crane-x'`): two arms crossing at a 4-way junction.
    // Each arm is laid as its two straights either side of the junction — four runs of stock
    // segments, so the room derives a clamp slot every 0.5 m along each half-arm. The junction
    // (no piece of that kind in the catalogue) stays the rig's own box.
    const zArm = byId.get('rig-truss-z-arm')
    const junction = byId.get('rig-truss-junction')
    if (header && towers.length === 0 && zArm) {
        const t = header.components.transform
        const chord = r3(t.position[1] + (t.scale[1] || TRUSS_SECTION_M) / 2)
        const [cx, , cz] = t.position
        const half = t.scale[0] / 2
        const j = junction ? junction.components.transform.scale[0] / 2 : 0
        const runs = [
            [[cx - j, cz], [cx - half, cz], 'x-left'], [[cx + j, cz], [cx + half, cz], 'x-right'],
            [[cx, cz - j], [cx, cz - half], 'z-back'], [[cx, cz + j], [cx, cz + half], 'z-crowd']
        ]
        let k = 0
        for (const [from, to, name] of runs) {
            layRun({ from: from.map(r3), to: to.map(r3), y: chord }).forEach((seg) => {
                k += 1
                out.push({ id: `rig-x-${k}`, name: `X arm, ${name} half (hung from the crane bridge)`, kind: seg.kind, position: seg.position, yaw: seg.yaw, height: null, replaces: k === 1 ? header.id : k === 2 ? zArm.id : null })
            })
        }
    } else if (header && towers.length === 0 && roll) {
        // A SLOPED line (the cut, 2026-09-29): the box is base-anchored and rolled about z, so its
        // centre line runs through anchor + half a section along the rolled "up"; stock pieces
        // end to end along the slope, each rolled the same.
        const t = header.components.transform
        const sec = t.scale[1] || TRUSS_SECTION_M
        const dir = [Math.cos(roll), Math.sin(roll)]
        const up = [-Math.sin(roll), Math.cos(roll)]
        const mid = [t.position[0] + up[0] * sec / 2, t.position[1] + up[1] * sec / 2]
        let s = -t.scale[0] / 2
        trussSegments(t.scale[0]).forEach((m, i) => {
            const c = s + m / 2
            s += m
            out.push({ id: `rig-line-${i + 1}`, name: 'truss line (hung from the crane bridge, sloped)', kind: `truss-${m}m`, position: [r3(mid[0] + dir[0] * c), r3(mid[1] + dir[1] * c), t.position[2]], yaw: 0, roll: Math.round(roll * 1e9) / 1e9, height: null, replaces: i === 0 ? header.id : null })
        })
    } else if (header && towers.length === 0) {
        const t = header.components.transform
        const chord = r3(t.position[1] + (t.scale[1] || TRUSS_SECTION_M) / 2)
        const half = t.scale[0] / 2
        layRun({ from: [r3(t.position[0] - half), t.position[2]], to: [r3(t.position[0] + half), t.position[2]], y: chord }).forEach((seg, i) => {
            out.push({ id: `rig-line-${i + 1}`, name: 'truss line (hung from the crane bridge)', kind: seg.kind, position: seg.position, yaw: seg.yaw, height: null, replaces: i === 0 ? header.id : null })
        })
    }
    // The halo (rig-lib `truss.shape: 'triangle'`): each side's stock straight, a box turned by
    // its yaw, laid as that run of pieces; its 60° corner blocks have no piece in the catalogue
    // (src/rigbuild/pieces.js) and stay drawn as the rig's boxes (rig-halo-corner-*).
    for (const side of entities.filter((e) => /^rig-halo-side-\d+$/.test(e.id))) {
        const t = side.components.transform
        const chord = r3(t.position[1] + (t.scale[1] || TRUSS_SECTION_M) / 2)
        const yaw = t.rotation?.[1] || 0
        const half = t.scale[0] / 2
        const dir = [Math.cos(yaw), -Math.sin(yaw)]
        const from = [r3(t.position[0] - dir[0] * half), r3(t.position[2] - dir[1] * half)]
        const to = [r3(t.position[0] + dir[0] * half), r3(t.position[2] + dir[1] * half)]
        layRun({ from, to, y: chord }).forEach((seg, i) => {
            out.push({ id: `${side.id.replace(/^rig-/, 'rig-piece-')}-${i + 1}`, name: 'halo side (hung from the crane bridge)', kind: seg.kind, position: seg.position, yaw: seg.yaw, height: null, replaces: i === 0 ? side.id : null })
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
    for (const id of ['rig-truss-tower-l', 'rig-truss-tower-r', 'rig-truss-header', 'rig-truss-z-arm', 'rig-stage-deck']) if (doc.entities.some((e) => e.id === id)) replaced.add(id)
    for (const p of pieces) {
        const base = catalogueHeightOf(p.kind)
        ops.push({
            type: 'createEntity',
            payload: {
                entity: {
                    id: p.id, type: 'model', name: p.name,
                    components: {
                        transform: { position: p.position, rotation: [0, p.yaw, p.roll || 0], scale: [1, base && p.height ? r3(p.height / base) : 1, 1] },
                        media: { assetId: assetFor[p.kind].id },
                        appearance: { color: '#8a8f98', opacity: 1 },
                        piece: { kind: p.kind }
                    }
                }
            }
        })
    }

    // The rig: out with the old lamps and the baked meshes, in with the typed ones —
    // or, --pieces-only, none: the cards deal the lamps.
    const incoming = args['pieces-only'] ? [] : doc.entities.filter((e) => !replaced.has(e.id))
    const incomingIds = new Set(incoming.map((e) => e.id))
    for (const id of deletions({ have, incomingIds, pieceIds: new Set(pieces.map((p) => p.id)), replaced, piecesOnly: Boolean(args['pieces-only']) })) {
        ops.push({ type: 'deleteEntity', payload: { entityId: id } })
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

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}

export { PIECES }
