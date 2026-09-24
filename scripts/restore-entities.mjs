#!/usr/bin/env node
// restore-entities.mjs — put back entities a project lost, from a saved copy of its document.
//
// Why this exists: on 2026-09-16 an audit deleted the 76 slides of the studio deck from
// `main-dii-project` as "debris", and on 09-18 a tier carry replaced prod's document with
// that copy. The files were never lost — only the entities pointing at them. The saved
// copies live in the nightly backup (`~/work/di-spaces`, one commit per night).
//
// It never replaces the document. It reads the tier's CURRENT document, finds the entities
// in the saved copy whose ids are no longer there, checks that every media file they point
// at is still served by the tier, and appends one `createEntity` op per entity through the
// ordinary ops route — so the op log records who did it and the change undoes like any other.
//
//   node scripts/restore-entities.mjs --project main-dii-project --from <saved.json> \
//        --base https://dev.diiii.xyz/serverXR [--type image] [--token <t>] [--dry-run]
//
// --from     a saved project document (bare, or `{ document: … }` as the backup stores it)
// --base     the tier's serverXR root; token from --token, else $RESTORE_API_TOKEN
// --type     only restore entities of this type (repeatable as a comma list)
// --dry-run  report what would be restored and which files answer; write nothing

import fs from 'node:fs'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const die = (message) => {
    console.error(`restore-entities: ${message}`)
    process.exit(1)
}

export function missingEntities(saved, current, types = null) {
    const have = new Set((current.entities || []).map((e) => e.id))
    return (saved.entities || []).filter((e) => !have.has(e.id) && (!types || types.includes(e.type)))
}

export function mediaAssetIds(entities) {
    return [...new Set(entities.map((e) => e.components?.media?.assetId).filter(Boolean))]
}

export function createOps(entities) {
    return entities.map((entity) => ({ opId: crypto.randomUUID(), type: 'createEntity', payload: { entity } }))
}

async function main() {
    const projectId = arg('project') || die('--project is required')
    const from = arg('from') || die('--from is required')
    const base = String(arg('base') || die('--base is required')).replace(/\/$/, '')
    const token = arg('token') || process.env.RESTORE_API_TOKEN || ''
    const types = arg('type') ? String(arg('type')).split(',') : null
    const dryRun = !!arg('dry-run', false)

    const raw = JSON.parse(fs.readFileSync(from, 'utf8'))
    const saved = raw.document || raw
    const auth = token ? { Authorization: `Bearer ${token}` } : {}

    const currentRes = await fetch(`${base}/api/projects/${projectId}/document`, { headers: auth })
    if (!currentRes.ok) die(`reading the current document answered ${currentRes.status}`)
    const currentBody = await currentRes.json()
    const current = currentBody.document || currentBody
    const version = Number(currentBody.version ?? currentBody.documentVersion ?? current.version)

    const missing = missingEntities(saved, current, types)
    console.log(`${projectId} @ ${base}: ${current.entities?.length ?? 0} entities now, ${missing.length} to restore${types ? ` (type ${types.join(',')})` : ''}`)
    if (!missing.length) return

    // Every file must answer before anything is written: a restored entity pointing at a
    // file the tier does not hold is a dark tile, which is worse than the gap.
    const ids = mediaAssetIds(missing)
    const bad = []
    for (const id of ids) {
        let status = 0
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const r = await fetch(`${base}/api/projects/${projectId}/assets/${id}`, { headers: { ...auth, Range: 'bytes=0-0' } })
            status = r.status
            await r.body?.cancel()
            if (status !== 429) break
            await new Promise((resolve) => setTimeout(resolve, 15000))
        }
        if (status !== 200 && status !== 206) bad.push(`${id} → ${status}`)
        await new Promise((resolve) => setTimeout(resolve, 1200))
    }
    console.log(`files: ${ids.length - bad.length}/${ids.length} answer`)
    if (bad.length) die(`files missing on this tier, nothing written:\n  ${bad.join('\n  ')}`)
    if (dryRun) return console.log('--dry-run: nothing written')

    if (!token) die('a write needs --token or $RESTORE_API_TOKEN')
    if (!Number.isInteger(version)) die('could not read the current document version')
    const res = await fetch(`${base}/api/projects/${projectId}/ops`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: version, ops: createOps(missing) })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) die(`ops answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`)
    console.log(`restored ${missing.length} entities; version ${version} → ${body.version ?? body.latestVersion ?? body.documentVersion ?? body.project?.documentVersion ?? '?'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => die(error.message))
}
