#!/usr/bin/env node
/**
 * copy-version.mjs — keep a rig VERSION as a visible, labelled copy beside it, before a change
 * replaces what the owner sees (a hall swap, a re-hang). RIG_BUILD.md §15.11.
 *
 * Owner, 2026-09-30: "we will not have the old versions?" → "keep the old ones as copies". A
 * backup file and the op log are not enough: he opens old and new side by side, from the same
 * row of version buttons.
 *
 *   node scripts/rigbuild/copy-version.mjs --api https://local.thedi.studio/serverXR --token-file ~/.di/di.env \
 *       --space moxir --from moxir-hall-minimal --to moxir-hall-minimal-oldhall-0929 --label "old hall 09-29" \
 *       [--suffix oldhall-0929] [--siblings <file>] [--dry-run]
 *   node scripts/rigbuild/copy-version.mjs … --undo --to moxir-hall-minimal-oldhall-0929   # delete the copy (only it)
 *
 * What a copy is: a NEW project in the same space (its own id — ids are global, the server
 * refuses a taken one with 409 and this script checks first) holding the source's document as
 * it is now — every entity, the night, the render settings, the opening shot, the cue list and
 * the show clock, the lamps' desk patch — and every asset it names, downloaded and uploaded
 * again (content-addressed: an id that comes back different is remapped, asset-remap-lib.mjs).
 * URLs that name the source project (`/api/projects/<from>/…`) are pointed at the copy. Kept as
 * it is on purpose: a copy of a desk-driven version is driven by the same desk fixtures (the room
 * joins DMX by fixture index, dmxPose.js), so it plays as the original plays today.
 *
 * Only the copy's own version mark (`components.rigVariant` on the show entity) changes: its id
 * (`<id>-<suffix>`), its title with the label (`labelled`), `copyOf`, and — with `--siblings`, a
 * JSON list of { id, projectId, title, summary } — the version buttons it shows. The source
 * project is only read.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { remapAssetIds } from '../asset-remap-lib.mjs'

/**
 * A label joined onto a version's title so the switch's short word carries it: the switch shows a
 * title up to its first " — " (RigVersionSwitch shortTitle), so the label goes just before that.
 * "Minimal — the cut, simple" + "old hall 09-29" → "Minimal · old hall 09-29 — the cut, simple".
 */
export const labelled = (title, label) => {
    const t = String(title || '')
    const i = t.indexOf(' — ')
    return i < 0 ? `${t} · ${label}` : `${t.slice(0, i)} · ${label}${t.slice(i)}`
}

/** Every string in `value` that names `/api/projects/<from>/` names `/api/projects/<to>/` instead. Pure. */
export const repointProjectUrls = (value, from, to) => {
    const needle = `/api/projects/${from}/`
    const walk = (v) => {
        if (typeof v === 'string') return v.includes(needle) ? v.split(needle).join(`/api/projects/${to}/`) : v
        if (Array.isArray(v)) return v.map(walk)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        return v
    }
    return walk(value)
}

/**
 * The copy's entities: identical, except the version mark on the show entity — its id and title
 * labelled, where it came from, and (when given) the buttons it lists. Pure.
 */
export const copiedEntities = (entities, { from, to, label, suffix, siblings = null }) => entities.map((e) => {
    const v = e?.components?.rigVariant
    if (!v) return e
    const mark = {
        ...v,
        id: `${v.id}-${suffix}`,
        title: labelled(v.title, label),
        copyOf: { projectId: from, id: v.id, label },
        ...(siblings ? { siblings } : {})
    }
    return { ...e, components: { ...e.components, rigVariant: mark } }
})

const readToken = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : die(`no ADMIN_API_TOKEN in ${file}`)
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api <install>/serverXR')).replace(/\/+$/, '')
    const client = makeClient(api, readToken(path.resolve(String(args['token-file'] || die('needs --token-file')))))
    const to = String(args.to || die('needs --to <new project id>'))

    if (args.undo) {
        const got = await client.get(`/api/projects/${to}/document`)
        if (!got.ok) die(`${to}: ${got.status} — nothing to undo`)
        const mark = got.body.document.entities.find((e) => e.components?.rigVariant)?.components.rigVariant
        if (!mark?.copyOf) die(`${to} is not a copy made by copy-version.mjs (no rigVariant.copyOf) — refusing to delete it`)
        const out = await client.del(`/api/projects/${to}`)
        if (!out.ok) die(`deleting ${to}: ${out.status} ${out.text.slice(0, 200)}`)
        say(`${to}: deleted (a copy of ${mark.copyOf.projectId}; the original was never written)`)
        return
    }

    const space = String(args.space || die('needs --space'))
    const from = String(args.from || die('needs --from <project id>'))
    const label = String(args.label || die('needs --label, e.g. "old hall 09-29"'))
    // the version id's suffix; default the label as a slug ("old hall 09-29" → "old-hall-09-29")
    const suffix = String(args.suffix || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || die('empty suffix')
    const siblings = args.siblings ? JSON.parse(fs.readFileSync(path.resolve(String(args.siblings)), 'utf8')) : null
    const dry = Boolean(args['dry-run'])

    // 1. the new id must be free — on the whole install, not only in this space
    const taken = await client.get(`/api/projects/${to}`)
    if (taken.ok) die(`${to} exists already (ids are global) — pick another id, or --undo it first`)
    if (taken.status !== 404) die(`checking ${to}: ${taken.status} ${taken.text.slice(0, 200)}`)

    // 2. the source, as it is now
    const meta = await client.get(`/api/projects/${from}`)
    if (!meta.ok) die(`reading ${from}: ${meta.status}`)
    const src = await client.get(`/api/projects/${from}/document`)
    if (!src.ok) die(`reading ${from}'s document: ${src.status}`)
    const source = src.body.document
    // the project's own title (the space's list) ends with the label; the version mark's title
    // carries it before its dash, for the switch's button (copiedEntities)
    const title = `${meta.body.project?.title || source.projectMeta?.title || from} · ${label}`
    say(`${from} (version ${src.body.version}, ${source.entities.length} entities, ${source.assets.length} assets) → ${to} "${title}"`)
    if (dry) { say('--dry-run: nothing written'); return }

    // 3. the project
    const made = await client.post(`/api/spaces/${space}/projects`, { title, slug: to })
    if (!made.ok) die(`creating ${to}: ${made.status} ${made.text.slice(0, 200)}`)
    const madeId = made.body.project?.id || made.body.id || to
    if (madeId !== to) die(`the server made ${madeId}, not ${to} — stopping; nothing copied into it (remove it with DELETE /api/projects/${madeId})`)

    // 4. every asset, as bytes
    const remap = {}
    const assets = []
    for (const a of source.assets) {
        const got = await client.bytes(`/api/projects/${from}/assets/${a.id}`)
        if (!got.ok) die(`downloading ${a.name} (${a.id}): ${got.status}`)
        const form = new FormData()
        form.append('asset', new Blob([got.buffer], { type: a.mimeType || 'application/octet-stream' }), a.name)
        const up = await client.post(`/api/projects/${to}/assets`, form)
        if (!up.ok) die(`copying ${a.name}: ${up.status} ${up.text.slice(0, 200)}`)
        if (up.body.asset.id !== a.id) remap[a.id] = up.body.asset.id
        assets.push({ ...a, ...up.body.asset, name: a.name })
        say(`  asset ${a.name} (${a.size ?? got.buffer.byteLength} bytes)${remap[a.id] ? ` — came back as ${up.body.asset.id}, remapped` : ''}`)
    }

    // 5. the document: the source's, pointed at the copy, its version mark labelled
    let document = { ...source, projectMeta: { ...source.projectMeta, id: to, title }, assets }
    document = repointProjectUrls(remapAssetIds(document, remap), from, to)
    document.entities = copiedEntities(document.entities, { from, to, label, suffix, siblings })
    const put = await client.put(`/api/projects/${to}/document`, document)
    if (!put.ok) die(`writing ${to}'s document: ${put.status} ${put.text.slice(0, 300)}`)

    // 6. read it back: the same entities (but the mark), the same assets
    const back = await client.get(`/api/projects/${to}/document`)
    const same = back.ok && back.body.document.entities.length === source.entities.length && back.body.document.assets.length === source.assets.length
    if (!same) die(`${to}: read back ${back.body?.document?.entities?.length} entities / ${back.body?.document?.assets?.length} assets, the source has ${source.entities.length} / ${source.assets.length}`)
    say(`${to}: written (version ${back.body.version}) — ${source.entities.length} entities, ${assets.length} assets; ${from} was only read`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
