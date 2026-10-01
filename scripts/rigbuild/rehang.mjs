#!/usr/bin/env node
/**
 * rehang.mjs — hang a version's NEW rig in a project that already exists, as ops, and touch
 * nothing that is not the rig's. docs/architecture/RIG_BUILD.md §15.8.
 *
 *   node scripts/rigbuild/rehang.mjs --api https://local.thedi.studio/serverXR --project moxir-hall-minimal \
 *       --version minimal --hall <hall.json> --token-file ~/.di/di.env [--rest red-room] [--dry-run] [--out <dir>]
 *
 * Why not load-version.mjs: that one CREATES a version's project — it PUTs the whole document
 * (the hall copied again) and writes the version's night. On a project other hands are working
 * in (2026-09-29: the realism pass wrote the atmosphere, exposure, the black night and every
 * lamp's lens aperture into moxir-hall-minimal) that would throw their work away. This one:
 *
 *   - builds the version's rig typed (moxir.mjs moxirDocument), rested on one look (`--rest`,
 *     default red-room) at NOMINAL light — a look's level scales a lamp's light, so a lamp
 *     written at 0 could never come back (RIG_BUILD §15.6);
 *   - lays its line as stock pieces (load-plot.mjs piecesFromRigBoxes — a sloped line too);
 *   - deletes the OLD rig's lamps, pieces and boxes, creates the new ones — carrying over from
 *     the document what another pass wrote on the lamps it replaces (`beam.aperture`, by type;
 *     for a type the document does not hold yet, the fixture manifest's lens: realism.mjs's rule);
 *   - on the show entity writes only the equipment list, the looks and the version mark
 *     (its `rigBounce` and anything else stays);
 *   - never touches worldState, renderSettings, the hall, the venue plan, the wash (re-bake it
 *     with rig.mjs --wash-only) or the patch (patch-plan.mjs re-addresses from the plan).
 * Re-reads the document right before it writes and sends against that version, so it never
 * writes over someone's newer ops. `--out` keeps the ops it sent (the undo is the .diiii saved
 * before it: `di open`).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient, mimeFor } from '../place/api.mjs'
import { FIXTURE_DIR } from '../place/fixtures-glb.mjs'
import { RIG_SHOW_ID, libraryWithShow } from '../../src/rigbuild/rental.js'
import { piecesFromRigBoxes } from './load-plot.mjs'
import { moxirDocument } from './moxir.mjs'
import { loadLibrary } from './library.mjs'
import { rigLooksFrom } from './looks.mjs'
import { variantOf } from './load-version.mjs'
import { projectOf, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { catalogueHeightOf } from '../../src/rigbuild/pieces.js'
import { isWashEntityId } from '../../src/rigbuild/looks.js'
import { isMainModule } from '../lib/isMainModule.mjs'

const r3 = (v) => Math.round(v * 1000) / 1000
const isRig = (e) => e.id.startsWith('rig-')
// What stays of the old rig: the show's entity, the baked washes — the single one (rig.mjs
// --wash-only re-bakes it) and the per-look ones (`rig-wash:<look>`, --wash-per-look, §15.13).
const KEEP = { has: (id) => id === RIG_SHOW_ID || isWashEntityId(id) }

/** A lamp's lens radius for its type, as realism.mjs sets it: the manifest's lens or window. */
export const apertureOf = (typeId, library, manifest) => {
    const type = library.types.find((t) => t.id === typeId)
    const p = manifest.kinds?.[type?.manifest?.kind]?.model?.params || {}
    const lens = Number(p.head?.lens_mm) || Number(p.window_mm) || null
    return lens > 0 ? Math.round((lens / 2000) * 1000) / 1000 : null
}

/** The ops: out with the old rig, in with the new, carrying what other passes wrote. Pure. */
export const rehangOps = ({ current, incoming, pieces, assetFor, carry = {}, show }) => {
    const ops = []
    const newIds = new Set([...incoming.map((e) => e.id), ...pieces.map((p) => p.id)])
    for (const e of current.entities) {
        if (!isRig(e) || KEEP.has(e.id)) continue
        ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    }
    for (const p of pieces) {
        const base = catalogueHeightOf(p.kind)
        ops.push({ type: 'createEntity', payload: { entity: {
            id: p.id, type: 'model', name: p.name,
            components: {
                transform: { position: p.position, rotation: [0, p.yaw, p.roll || 0], scale: [1, base && p.height ? r3(p.height / base) : 1, 1] },
                media: { assetId: assetFor[p.kind] },
                appearance: { color: '#8a8f98', opacity: 1 },
                piece: { kind: p.kind }
            }
        } } })
    }
    for (const e of incoming) {
        const type = e.components?.fixture?.type
        const extra = type && carry[type] && e.components.beam ? { beam: { ...e.components.beam, ...carry[type] } } : {}
        ops.push({ type: 'createEntity', payload: { entity: { ...e, components: { ...e.components, ...extra } } } })
    }
    for (const [component, patch] of Object.entries(show)) {
        ops.push({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component, patch } })
    }
    return { ops, newIds }
}

const readTokenFile = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

/**
 * The project's own body for a piece kind, when it is the CURRENT file's: same name AND same content hash
 * (asset ids are sha-256 of the bytes). A same-named asset with other content is stale and is not reused.
 * Pure.
 */
export const pieceAssetOf = (assets, kind, sha256) => (assets || []).find((a) => a.name === `rigbuild-${kind}.glb` && a.id === sha256) || null

const main = async () => {
    const args = parseArgs()
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('needs --api <base>/serverXR — no default on purpose')
    const id = String(args.version || die('needs --version <id> of the versions file'))
    const project = String(args.project || projectOf('moxir-hall', id))
    const hall = readJson(path.resolve(String(args.hall || die('needs --hall <hall.json>'))))
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file')))) || die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const rigFile = rigFileOf(spec.set, id)
    const rig = readJson(path.join(REPO_ROOT, rigFile))
    const rest = String(args.rest || 'red-room')
    if (!rig.looks[rest]) die(`${rigFile} has no look "${rest}"`)
    // rested on the look at NOMINAL light: its aims and colours, no levels
    const nominal = { ...rig, defaultLook: rest, looks: { ...rig.looks, [rest]: { ...rig.looks[rest], levels: undefined } } }
    const { rentalList } = readJson(path.join(REPO_ROOT, rentalFileOf(spec.set, id)))
    const library = libraryWithShow(loadLibrary(), rentalList)
    const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
    const { document } = moxirDocument({ rig: nominal, hall, library })
    const pieces = piecesFromRigBoxes(document.entities)
    const replaced = new Set(pieces.map((p) => p.replaces).filter(Boolean))
    const incoming = document.entities.filter((e) => !replaced.has(e.id) && !KEEP.has(e.id))

    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const current = got.body.document
    // what the realism pass (or anyone) wrote on the lamps, by type — else the manifest's lens
    const carry = {}
    for (const e of current.entities) {
        const type = e.components?.fixture?.type
        const aperture = e.components?.beam?.aperture
        if (type && aperture != null && !carry[type]) carry[type] = { aperture }
    }
    const hadAperture = Object.keys(carry).length > 0
    for (const e of incoming) {
        const type = e.components?.fixture?.type
        if (hadAperture && type && !carry[type] && e.components.beam) {
            const a = apertureOf(type, library, manifest)
            if (a != null) carry[type] = { aperture: a }
        }
    }
    // piece bodies: the document's own asset when ITS CONTENT is the current file's, else upload it. (By name
    // alone a regenerated model — the matte steel of 2026-09-30 — was never picked up.) Asset ids are content hashes.
    const assetFor = {}
    const uploads = []
    for (const kind of new Set(pieces.map((p) => p.kind))) {
        const file = path.join(REPO_ROOT, 'scripts/rigbuild/pieces', `${kind}.glb`)
        const bytes = fs.readFileSync(file)
        const have = pieceAssetOf(current.assets, kind, crypto.createHash('sha256').update(bytes).digest('hex'))
        if (have) { assetFor[kind] = have.id; continue }
        if (args['dry-run']) { assetFor[kind] = `dry-${kind}`; continue }
        const form = new FormData()
        form.append('asset', new Blob([bytes], { type: mimeFor(file) }), `rigbuild-${kind}.glb`)
        const up = await client.post(`/api/projects/${project}/assets`, form)
        if (!up.ok) die(`upload ${kind}: ${up.status} ${up.text.slice(0, 200)}`)
        assetFor[kind] = up.body.asset.id
        uploads.push({ type: 'upsertAsset', payload: { asset: up.body.asset } })
    }
    const show = { rentalList, rigLooks: rigLooksFrom(rig, rigFile), rigVariant: variantOf(spec, id, 'moxir-hall') }
    const { ops } = rehangOps({ current, incoming, pieces, assetFor, carry, show })
    const all = [...uploads, ...ops]
    const counts = all.reduce((m, o) => ({ ...m, [o.type]: (m[o.type] || 0) + 1 }), {})
    say(`${project} @ v${got.body.version}: ${pieces.length} pieces (${pieces.map((p) => p.kind).join(' + ')}), ${incoming.filter((e) => e.type === 'spotLight').length} lamps, rested on ${rest} at nominal; carried ${JSON.stringify(carry)}; ops ${JSON.stringify(counts)}`)
    if (args.out) fs.writeFileSync(path.join(path.resolve(String(args.out)), `rehang-${project}-ops.json`), JSON.stringify(all, null, 1))
    if (args['dry-run']) { say('dry run: nothing written'); return }
    // re-read right before writing: send against the document as it is NOW
    const now = await client.get(`/api/projects/${project}/document`)
    if (now.body.version !== got.body.version) die(`${project} moved from v${got.body.version} to v${now.body.version} while this was built — run again`)
    let version = now.body.version
    for (let i = 0; i < all.length; i += 100) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops: all.slice(i, i + 100).map((op, j) => ({ ...op, opId: `rehang-${Date.now()}-${i + j}`, clientId: 'rehang' })) })
        if (!out.ok) die(`ops ${i}–${i + 100}: ${out.status} ${out.text.slice(0, 300)}`)
        version = out.body.newVersion
    }
    say(`${project}: written, version ${version}. Next: rig.mjs --wash-only --look ${rest}; patch-plan.mjs; the show loop.`)
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
