#!/usr/bin/env node
/**
 * stage-base.mjs — the minimum an EMPTY scratch project needs before epic-build can aim looks in it.
 *
 * epic-build was written for a copy of a hall project that already holds a riser (deck pieces) and a venue plan;
 * lookFrame (src/rigbuild/looks.js) reads both, and updateComponent on `rig-show` does nothing if that entity is absent.
 * This script lays exactly those, from a rig file's own solids (data only — no production name is checked):
 *   rig-show        the group entity epic-build writes rigLooks / rigParts / rigVariant onto
 *   rig-venue       one entity with a `venuePlan`: a padded outline, a `stage` zone (the deck) and a `dance` zone (the audience side)
 *   stage-deck-*    the riser as catalogue `deck-2x1` pieces, tiled INSIDE the deck solid's footprint and 0.02 m lower than its top,
 *                   so the solid box epic-build lays from the same rig file hides them (no coplanar faces)
 * The rig's solids themselves (deck, screen, trusses, wings, towers, tables) are NOT laid here: epic-build lays every rig.solids
 * entry as a box, and a second copy would collide on id.
 *
 *   node scripts/rigbuild/stage-base.mjs --api http://127.0.0.1:4319/serverXR --project <empty project> --rig <rig file> \
 *        [--deck <solid id>] [--into 1|-1] [--token-file <env>] [--apply]
 *
 * The deck solid: --deck, else the widest box whose bottom is on the floor and whose top is <= 1.2 m (a stage deck), >= 10 m².
 * Dry run unless --apply. Localhost only. Refuses a project that already holds any of these ids. Undo: delete the project
 * (or deleteEntity on rig-show, rig-venue, stage-deck-*).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const r3 = (v) => Math.round(v * 1000) / 1000
const TILE = [2, 1]          // the catalogue deck piece, deck-2x1 (src/rigbuild/pieces.js)
const SINK = 0.02            // the tiles' top below the solid's top
const PAD = 6                // venue outline margin around every solid (m)
const AUDIENCE_DEPTH = 12    // the dance zone's depth in front of the deck (m)

const footprint = (s) => ({ x0: s.p[0] - s.s[0] / 2, x1: s.p[0] + s.s[0] / 2, z0: s.p[2] - s.s[2] / 2, z1: s.p[2] + s.s[2] / 2, top: s.p[1] + s.s[1] })

/** The deck solid of a rig file: --deck's id, else the widest floor-standing box <= 1.2 m high of >= 10 m². Pure; null when none. */
export const deckSolidOf = (rig, id = null) => {
    const boxes = (rig?.solids || []).filter((s) => s.kind === 'box' && Array.isArray(s.p) && Array.isArray(s.s))
    if (id) return boxes.find((s) => s.id === id) || null
    return boxes.filter((s) => s.p[1] <= 0.05 && s.s[1] <= 1.2 && s.s[0] * s.s[2] >= 10).sort((a, b) => b.s[0] - a.s[0])[0] || null
}

const base = (position, scale = [1, 1, 1]) => ({ position, rotation: [0, 0, 0], scale })

/** The entities an empty project needs. Pure. Throws when the rig has no deck solid. */
export const stageBaseEntities = (rig, { deck = null, into = 1 } = {}) => {
    const d = deckSolidOf(rig, deck)
    if (!d) throw new Error('no deck solid in the rig file (a floor-standing box <= 1.2 m high, >= 10 m²); name one with --deck <solid id>')
    const f = footprint(d)
    const nx = Math.floor((f.x1 - f.x0) / TILE[0] + 1e-9)
    const nz = Math.floor((f.z1 - f.z0) / TILE[1] + 1e-9)
    const x0 = (f.x0 + f.x1) / 2 - (nx * TILE[0]) / 2
    const z0 = (f.z0 + f.z1) / 2 - (nz * TILE[1]) / 2
    const height = r3(f.top - SINK)
    const tiles = []
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        tiles.push({ id: `stage-deck-${i}-${k}`, type: 'group', name: `stage deck ${i + 1}.${k + 1}`, parentId: null,
            components: { transform: base([r3(x0 + TILE[0] * (i + 0.5)), 0, r3(z0 + TILE[1] * (k + 0.5))], [1, height, 1]), piece: { kind: 'deck-2x1' } } })
    }
    const all = (rig.solids || []).filter((s) => Array.isArray(s.p) && Array.isArray(s.s)).map(footprint)
    const ext = [Math.min(...all.map((a) => a.x0)) - PAD, Math.min(...all.map((a) => a.z0)) - PAD, Math.max(...all.map((a) => a.x1)) + PAD, Math.max(...all.map((a) => a.z1)) + PAD]
    const stageRect = [r3(f.x0), r3(f.z0), r3(f.x1), r3(f.z1)]
    const front = into > 0 ? f.z1 : f.z0
    const danceRect = into > 0 ? [r3(f.x0), r3(front), r3(f.x1), r3(front + AUDIENCE_DEPTH)] : [r3(f.x0), r3(front - AUDIENCE_DEPTH), r3(f.x1), r3(front)]
    const plan = {
        name: `${rig.title || 'rig'} — stage base`, source: `scripts/rigbuild/stage-base.mjs from the rig file's solids (deck ${d.id})`,
        warning: 'a stage frame for aiming looks, not a survey of the venue',
        outline: [[ext[0], ext[1]], [ext[2], ext[1]], [ext[2], ext[3]], [ext[0], ext[3]]].map((p) => p.map(r3)),
        zones: [{ id: 'stage', label: 'stage', rects: [stageRect] }, { id: 'dance', label: 'audience', rects: [danceRect] }]
    }
    return [
        { id: 'rig-show', type: 'group', name: 'the show', parentId: null, components: { transform: base([0, 0, 0]) } },
        { id: 'rig-venue', type: 'group', name: 'venue', parentId: null, components: { transform: base([0, 0, 0]), venuePlan: plan,
            // NOT the building: an entity with a venuePlan is taken for the hall (smartViewGeometry.js isArchitectureEntity), and the room
            // bounds its haze by the building's box (beamReach.js buildingOf). This frame has no walls, only a 12 cm marker: its box
            // shut the air into +-0.06 m and no beam was drawn at all (measured 2026-11-11: uHazeBoxMin/Max +-0.06). A frame has open air.
            viewRole: 'frame' } },
        ...tiles
    ]
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const api = String(args.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('stage-base.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(args.project || die('needs --project <an empty project>'))
    const rigPath = path.resolve(String(args.rig || die('needs --rig <rig file>')))
    const rig = JSON.parse(fs.readFileSync(rigPath, 'utf8'))
    let ents
    try { ents = stageBaseEntities(rig, { deck: args.deck ? String(args.deck) : null, into: Number(args.into ?? 1) < 0 ? -1 : 1 }) } catch (e) { die(e.message) }
    const client = makeClient(api, args['token-file'] ? readToken(String(args['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const have = new Set(got.body.document.entities.map((e) => e.id))
    const clash = ents.filter((e) => have.has(e.id)).map((e) => e.id)
    if (clash.length) die(`${project} already holds ${clash.slice(0, 5).join(', ')}${clash.length > 5 ? '…' : ''}: refusing (this is for an empty project)`)
    say(`${project} @ v${got.body.version}: create ${ents.length} entities (rig-show, rig-venue, ${ents.length - 2} deck tiles)`)
    if (!args.apply) { say('dry run: nothing written (--apply to write; undo: delete the project)'); return }
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ents.map((entity, j) => ({ type: 'createEntity', payload: { entity }, opId: `stage-base-${Date.now()}-${j}`, clientId: 'stage-base' })) })
    if (!out.ok) die(`ops: ${out.status} ${String(out.text).slice(0, 300)}`)
    const back = await client.get(`/api/projects/${project}/document`)
    const ids = new Set(back.body.document.entities.map((e) => e.id))
    const missing = ents.filter((e) => !ids.has(e.id))
    if (missing.length) die(`read back: ${missing.length} missing (${missing.slice(0, 3).map((e) => e.id).join(', ')})`)
    say(`written, version ${out.body.newVersion}; read back: ${back.body.document.entities.length} entities`)
}

if (isMainModule(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1) })
