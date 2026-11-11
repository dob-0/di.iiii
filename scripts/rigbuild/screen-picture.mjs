#!/usr/bin/env node
/**
 * screen-picture.mjs: put a still on a project's LED screen, so the visuals can be looked at together with the lights.
 *
 *   node scripts/rigbuild/screen-picture.mjs --api http://127.0.0.1:<port>/serverXR --project <id> --token-file <env>
 *        --file <still.png> [--screen platina-screen] [--level 1] [--undo]
 *
 * What it does: uploads the PNG as a project asset and lays ONE `image` entity (`<screen>-picture`) on the audience face
 * of the screen solid, exactly the solid's width and height. The image entity is drawn unlit and outside tone mapping
 * (src/objectComponents/ImageObject.jsx), like an emitting wall: `--level` (0..1, its opacity over the dark cabinet box)
 * is the wall's brightness. Run it again with another file to change the picture; `--undo` removes picture and asset.
 * It does not light the room from the wall (OWED: the wall as a light source).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const IMAGE_PLANE_H = 3 // ImageObject draws a plane 3 units high, aspect × 3 wide
const GAP = 0.005       // in front of the cabinet face, so the two faces do not fight

/** Width and height of a PNG from its header. Throws on anything else. */
export const pngSize = (buf) => {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** The picture entity for a screen entity (a box drawn from its centre, +z = the audience). Pure. */
export const pictureEntity = ({ screen, assetId, px, level = 1 }) => {
    const t = screen.components.transform
    const [w, h, d] = t.scale
    const aspect = px.width / px.height
    const r = (v) => Math.round(v * 1000) / 1000
    return {
        id: `${screen.id}-picture`, type: 'image', name: `${screen.id}: the picture on the wall (${px.width} x ${px.height} px)`, parentId: null,
        components: {
            transform: { position: [t.position[0], t.position[1], r(t.position[2] + d / 2 + GAP)], rotation: [0, 0, 0], scale: [r(w / (aspect * IMAGE_PLANE_H)), r(h / IMAGE_PLANE_H), 1] },
            appearance: { opacity: Math.max(0, Math.min(1, Number(level) || 0)) },
            media: { assetId }
        }
    }
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api <install>/serverXR')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(String(args['token-file'] || die('needs --token-file'))))
    const screenId = String(args.screen || 'platina-screen')
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`${project}: ${got.status}`)
    const doc = got.body.document
    const post = async (ops, tag) => {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `screen-picture-${tag}-${Date.now()}-${j}`, clientId: 'screen-picture' })) })
        if (!out.ok) die(`writing ${project}: ${out.status} ${String(out.text || '').slice(0, 200)}`)
        return out.body.version ?? out.body.newVersion
    }
    const old = doc.entities.find((e) => e.id === `${screenId}-picture`)
    if (args.undo) {
        if (!old) return say(`${project}: no ${screenId}-picture — nothing to undo`)
        const ops = [{ type: 'deleteEntity', payload: { entityId: old.id } }]
        if (old.components?.media?.assetId) ops.push({ type: 'deleteAsset', payload: { assetId: old.components.media.assetId } })
        return say(`${project}: picture removed, version ${await post(ops, 'undo')}`)
    }
    const screen = doc.entities.find((e) => e.id === screenId) || die(`${project} has no entity ${screenId}`)
    const file = path.resolve(String(args.file || die('needs --file <still.png>')))
    const bytes = fs.readFileSync(file)
    const px = pngSize(bytes)
    const form = new FormData()
    form.append('asset', new Blob([bytes], { type: 'image/png' }), path.basename(file))
    const up = await client.post(`/api/projects/${project}/assets`, form)
    if (!up.ok) die(`uploading ${path.basename(file)}: ${up.status} ${String(up.text || '').slice(0, 200)}`)
    const asset = up.body.asset
    const entity = pictureEntity({ screen, assetId: asset.id, px, level: args.level ?? 1 })
    const ops = [{ type: 'upsertAsset', payload: { asset } }, { type: 'createEntity', payload: { entity } }]
    if (old?.components?.media?.assetId && old.components.media.assetId !== asset.id) ops.push({ type: 'deleteAsset', payload: { assetId: old.components.media.assetId } })
    const version = await post(ops, 'set')
    const back = await client.get(`/api/projects/${project}/document`)
    const e = back.body.document.entities.find((x) => x.id === entity.id)
    const a = back.body.document.assets.find((x) => x.id === asset.id)
    if (!e || !a) die(`${project}: read back picture ${Boolean(e)}, asset ${Boolean(a)}`)
    say(`${project} version ${version}: ${path.basename(file)} (${px.width} x ${px.height}) on ${screenId}, at ${JSON.stringify(e.components.transform.position)} scale ${JSON.stringify(e.components.transform.scale)}, level ${e.components.appearance.opacity}`)
}

if (isMainModule(import.meta.url)) {
    main().catch((e) => die(e.message))
}
