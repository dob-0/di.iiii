#!/usr/bin/env node
/**
 * screen-picture.mjs: put a still on a project's LED screen, so the visuals can be looked at together with the lights.
 *
 *   node scripts/rigbuild/screen-picture.mjs --api http://127.0.0.1:<port>/serverXR --project <id> --token-file <env>
 *        --file <still.png> [--screen platina-screen] [--level 1] [--looks <map.json>] [--undo]
 *
 * What it does: uploads the PNG as a project asset and lays ONE `image` entity (`<screen>-picture`) on the audience face
 * of the screen solid, exactly the solid's width and height. The image entity is drawn unlit and outside tone mapping
 * (src/objectComponents/ImageObject.jsx), like an emitting wall: `--level` (0..1, its opacity over the dark cabinet box)
 * is the wall's brightness. Run it again with another file to change the picture; `--undo` removes picture and asset.
 * `--looks <map.json>` ({ byLook: { <lookId>: <file.png> } }; the stills in `--looks-dir`, default the map's own folder): uploads each still once and
 * writes `lookMedia.byLook` on the picture, so the room shows each look's own still and a dark wall in a look the map does not
 * name (src/rigbuild/lookMedia.js, owner N3855). Stills only: a moving loop on the wall is OWED.
 * It does not light the room from the wall (OWED: the wall as a light source).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const IMAGE_PLANE_H = 3 // ImageObject draws a plane 3 units high, aspect × 3 wide
const GAP = 0.005       // in front of the cabinet face, so the two faces do not fight
// ImageObject lays its plane FLAT (a floor sticker: the mesh is turned -90 deg about x). A wall picture stands it up again
// with +90 deg about x; the plane's height then runs along the entity's own z, so the HEIGHT is the scale's third number.
// (2026-11-12: with rotation 0 the picture lay flat inside the wall, seen only as a thin red band at its foot.)
const UPRIGHT = [Math.round(Math.PI / 2 * 1e6) / 1e6, 0, 0]

/** Width and height of a PNG from its header. Throws on anything else. */
export const pngSize = (buf) => {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** The picture entity for a screen entity (a box drawn upward from its position = its foot, +z = the audience). Pure. */
export const pictureEntity = ({ screen, assetId, px, level = 1 }) => {
    const t = screen.components.transform
    const [w, h, d] = t.scale
    const aspect = px.width / px.height
    const r = (v) => Math.round(v * 1000) / 1000
    return {
        id: `${screen.id}-picture`, type: 'image', name: `${screen.id}: the picture on the wall (${px.width} x ${px.height} px)`, parentId: null,
        components: {
            transform: { position: [t.position[0], r(t.position[1] + h / 2), r(t.position[2] + d / 2 + GAP)], rotation: UPRIGHT, scale: [r(w / (aspect * IMAGE_PLANE_H)), 1, r(h / IMAGE_PLANE_H)] },
            appearance: { opacity: Math.max(0, Math.min(1, Number(level) || 0)) },
            media: { assetId },
            // a wall does not drift: with no animation the room's walk mode gives a loose object an idle motion
            // (entityAnimation.js resolveAnimation), and the picture floated off its screen (owner N3853, 2026-11-12)
            animation: { mode: 'static', speed: 1, amplitude: 1 }
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
        for (const id of new Set([old.components?.media?.assetId, ...Object.values(old.components?.lookMedia?.byLook || {})])) if (id) ops.push({ type: 'deleteAsset', payload: { assetId: id } })
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
    const ops = [{ type: 'upsertAsset', payload: { asset } }]
    if (args.looks) {
        const mapFile = path.resolve(String(args.looks))
        const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
        const dir = path.resolve(String(args['looks-dir'] || path.dirname(mapFile)))
        const byFile = new Map([[path.basename(file), asset.id]])
        const byLook = {}
        for (const [lookId, name] of Object.entries(map.byLook || {})) {
            if (!byFile.has(name)) {
                const b = fs.readFileSync(path.join(dir, name))
                const size = pngSize(b)
                if (size.width !== px.width || size.height !== px.height) die(`${name} is ${size.width} x ${size.height}, the wall still is ${px.width} x ${px.height}`)
                const f = new FormData()
                f.append('asset', new Blob([b], { type: 'image/png' }), name)
                const u = await client.post(`/api/projects/${project}/assets`, f)
                if (!u.ok) die(`uploading ${name}: ${u.status}`)
                byFile.set(name, u.body.asset.id)
                ops.push({ type: 'upsertAsset', payload: { asset: u.body.asset } })
            }
            byLook[lookId] = byFile.get(name)
        }
        entity.components.lookMedia = { byLook }
        say(`${project}: ${Object.keys(byLook).length} looks name a still, ${byFile.size} stills`)
    }
    ops.push({ type: 'createEntity', payload: { entity } })
    const keep = new Set([asset.id, ...Object.values(entity.components.lookMedia?.byLook || {})])
    for (const id of new Set([old?.components?.media?.assetId, ...Object.values(old?.components?.lookMedia?.byLook || {})])) if (id && !keep.has(id)) ops.push({ type: 'deleteAsset', payload: { assetId: id } })
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
