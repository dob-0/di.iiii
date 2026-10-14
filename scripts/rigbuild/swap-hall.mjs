#!/usr/bin/env node
/**
 * swap-hall.mjs — put a new hall.glb into a project's room: the model swaps in place.
 *
 *   node scripts/rigbuild/swap-hall.mjs --api http://localhost:4100/serverXR --project moxir-hall-known-full \
 *       --glb <hall.glb from hall.py> --token-file <env with ADMIN_API_TOKEN>
 *
 * Why it exists (2026-10-02, the hall corrections): load-version copies the hall's MODEL from the project
 * named by --hall-from, so a corrected hall.py build reaches a room only if that source project holds it.
 * Run this on the source (moxir-hall-minimal) and on any room built before the correction. The entity
 * `place-hall` keeps its id and every other component, so the lamps hung beside it stay; the old asset
 * reference is dropped. Run realism.mjs AFTER it (the night copy of the hall is made from this model).
 * Local installs only: refuses any other host.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'

/**
 * The ops that swap the hall: the new model is LISTED in the document's assets (upsertAsset) before the
 * hall points at it — without that the room draws no hall at all (seen 2026-09-28 and again 2026-10-07:
 * the asset was on disk, the entity named it, the scene stayed black). Repairs a swap that missed it
 * (same model, not listed). Pure.
 */
export const swapHallOps = ({ old, asset, listed, stamp }) => {
    const same = asset.id === old
    if (same && listed) return []
    const ops = []
    if (!listed) ops.push({ type: 'upsertAsset', payload: { asset }, opId: `swap-hall-asset-${stamp}`, clientId: 'swap-hall' })
    if (!same) {
        ops.push({ type: 'updateComponent', payload: { entityId: 'place-hall', component: 'media', patch: { assetId: asset.id } }, opId: `swap-hall-${stamp}`, clientId: 'swap-hall' })
        ops.push({ type: 'deleteAsset', payload: { assetId: old }, opId: `swap-hall-del-${stamp}`, clientId: 'swap-hall' })
    }
    return ops
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api')).replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|local\.thedi\.studio)(:\d+)?\//.test(`${api}/`)) die('swap-hall.mjs writes to a local install only')
    const project = String(args.project || die('needs --project'))
    const glb = String(args.glb || die('needs --glb'))
    if (!fs.existsSync(glb)) die(`no such file: ${glb}`)
    const token = readToken(args['token-file'] ? String(args['token-file']) : null) || die('no ADMIN_API_TOKEN (--token-file)')
    const client = makeClient(api, token)

    const doc = await client.get(`/api/projects/${project}/document`)
    if (!doc.ok) die(`reading ${project}: ${doc.status}`)
    const hall = (doc.body.document.entities || []).find((e) => e.id === 'place-hall')
    if (!hall?.components?.media?.assetId) die(`${project} has no place-hall model to swap`)
    const old = hall.components.media.assetId
    const form = new FormData()
    form.append('asset', new Blob([fs.readFileSync(glb)], { type: 'model/gltf-binary' }), 'hall.glb')
    const up = await client.post(`/api/projects/${project}/assets`, form)
    if (!up.ok || !up.body?.asset?.id) die(`uploading: ${up.status} ${String(up.text).slice(0, 200)}`)
    const stamp = Date.now()
    const listed = (doc.body.document.assets || []).some((x) => x.id === up.body.asset.id)
    const ops = swapHallOps({ old, asset: up.body.asset, listed, stamp })
    if (!ops.length) { say(`${project}: already holds this hall model, and lists it`); return }
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: doc.body.version, ops })
    if (!out.ok) die(`ops: ${out.status} ${String(out.text).slice(0, 200)}`)
    const back = await client.get(`/api/projects/${project}/document`)
    const ok = back.ok && (back.body.document.assets || []).some((x) => x.id === up.body.asset.id) &&
        (back.body.document.entities || []).find((e) => e.id === 'place-hall')?.components?.media?.assetId === up.body.asset.id
    if (!ok) die(`${project}: written, but the read-back does not list the hall model ${up.body.asset.id.slice(0, 10)}… — the room would draw no hall`)
    say(`${project}: hall model ${old.slice(0, 10)}… → ${up.body.asset.id.slice(0, 10)}… (listed); version ${out.body.newVersion}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => die(e.stack || e.message))
}
