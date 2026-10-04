#!/usr/bin/env node
/**
 * add-sources.mjs — more footage onto a sources wall that already hangs.
 *
 * import.mjs hangs a whole folder ONCE: it makes `<space>-sources` and builds
 * the wall with the total known, so it cannot add to a wall that exists (run
 * again it would re-upload everything and lay a second wall over the first).
 * Footage turns up later — a second card of photographs, files the first run's
 * server refused. This reads the wall as it hangs, leaves out what is already
 * on it, and hangs only the new files in NEW ROWS above the last one. No picture
 * already hung moves: the op list holds createEntity for the new ones and
 * nothing else.
 *
 * A separate file, not another flag on import.mjs: that script needs a
 * place.json work folder and a hall to run at all, and this needs neither —
 * only a space, a folder and the API. It reuses import.mjs's own upload and op
 * path (uploadAsset, sendOps) so a file goes up exactly as it did the first time.
 *
 * Usage:
 *   node scripts/place/add-sources.mjs --add-sources <dir> --name <space> [options]
 *
 *   --sources-project <id>  the project holding the wall (default <space>-sources)
 *   --api <base>            di.iiii API base (default https://local.thedi.studio/serverXR)
 *   --dry-run               say what would be uploaded, skipped and hung; change nothing
 *                           (it still READS the document, so it needs the token)
 *   --originals             also: for a name already hung whose file here is LARGER than the hung asset
 *                           (dev holds reduced copies), upload the original and point the SAME entity at
 *                           it (one updateComponent op, transform untouched); the old asset is dropped
 *                           from the document only after the new one reads back
 *   --allow-skips           exit 0 even if the server refused some file
 *   --token-file <path>     as in import.mjs
 *
 * Exit: 0 all done · 1 something failed · 2 the server refused a file (and no --allow-skips).
 */
import path from 'node:path'
import fs from 'node:fs'

import { parseArgs, say, warn, die, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, walkFiles, fmtBytes } from './common.mjs'
import { DEFAULT_API, makeClient, readToken, sourcesProjectId } from './api.mjs'
import { uploadAsset, sendOps, must } from './import.mjs'
import { SOURCE_WALL_DEFAULTS, sourceWallEntity, sourceWallSlot } from '../../src/scan/sourceWall.js'

/** `037-file_81.jpg` and `file_81.jpg` are one picture: compare without a leading number. */
export const bareName = (name) => String(name || '').toLowerCase().replace(/^\d+[-_ ]+/, '')

/** Every name already on the wall: asset names and entity names, whole and bare. */
export const hungNames = (document) => {
    const names = new Set()
    const add = (value) => {
        if (!value) return
        names.add(String(value).toLowerCase())
        names.add(bareName(value))
    }
    for (const asset of document?.assets || []) add(asset.name)
    for (const entity of document?.entities || []) {
        if (entity.type === 'image' || entity.type === 'video') add(entity.name)
    }
    return names
}

/** Split the folder's files into new and already hung (also a repeat name inside the folder). */
export const planFiles = (files, document) => {
    const hung = hungNames(document)
    const fresh = []
    const skipped = []
    for (const file of files) {
        const base = path.basename(file)
        const keys = [base.toLowerCase(), bareName(base)]
        if (keys.some((key) => hung.has(key))) {
            skipped.push({ file, name: base, why: 'already on the wall' })
            continue
        }
        // A second file of the same name in another subfolder would be hung twice.
        keys.forEach((key) => hung.add(key))
        fresh.push(file)
    }
    return { fresh, skipped }
}

const wallEntities = (document) =>
    (document?.entities || []).filter((entity) =>
        (entity.type === 'image' || entity.type === 'video') && entity.components?.transform?.position)

/**
 * Where the new rows start: the row above the highest picture hung, read from
 * the pictures' own heights (the wall was built with the total known, so its
 * TOP row is row 0 of the contact sheet; reading heights works for either
 * builder, the phone's or the importer's), and the next free `source-N` id.
 */
export const nextWallSlot = (document, options = {}) => {
    const { baseHeight, tile, gap } = { ...SOURCE_WALL_DEFAULTS, ...options }
    const rowStep = tile + gap
    const hung = wallEntities(document)
    const topY = hung.length ? Math.max(...hung.map((entity) => entity.components.transform.position[1])) : null
    const topRow = topY === null ? -1 : Math.round((topY - baseHeight) / rowStep)
    const usedNumbers = (document?.entities || [])
        .map((entity) => /^source-(\d+)$/.exec(String(entity.id || ''))?.[1])
        .filter(Boolean).map(Number)
    return { firstRow: topRow + 1, firstNumber: Math.max(0, ...usedNumbers) + 1 }
}

/**
 * The createEntity ops for new assets. `total` is left unknown, so every new
 * row is centred on a full row of `perRow`, exactly as the existing rows are,
 * and the new rows stack upward at the existing tile, gap and distance.
 */
export const addOps = (assets, document, options = {}) => {
    const { perRow } = { ...SOURCE_WALL_DEFAULTS, ...options }
    const { firstRow, firstNumber } = nextWallSlot(document, options)
    return assets.map((asset, k) => {
        const slot = firstRow * perRow + k
        const entity = sourceWallEntity(asset, slot, { ...options, total: null, id: `source-${firstNumber + k}` })
        // Pin the name: sourceWallEntity falls back to `source <slot>`.
        entity.name = asset.name
        return { type: 'createEntity', payload: { entity } }
    })
}

/**
 * Already-hung files whose original here is bigger than the asset on the wall.
 * Returns the swaps (entity, old asset, file, both sizes) and the matches left
 * alone (same size or smaller here: never trade a bigger picture for a smaller).
 */
export const planSwaps = (skipped, document) => {
    const swaps = []
    const same = []
    const claimed = new Set()
    for (const { file, name } of skipped) {
        const keys = [name.toLowerCase(), bareName(name)]
        const asset = (document?.assets || []).find((a) => !claimed.has(a.id) &&
            keys.some((key) => String(a.name || '').toLowerCase() === key || bareName(a.name) === key))
        const entity = asset && (document?.entities || []).find((e) => e.components?.media?.assetId === asset.id)
        if (!entity) continue
        claimed.add(asset.id)
        const localSize = fs.statSync(file).size
        if (localSize > Number(asset.size || 0)) swaps.push({ file, name, entity, asset, oldSize: Number(asset.size || 0), newSize: localSize })
        else same.push({ name, oldSize: Number(asset.size || 0), newSize: localSize })
    }
    return { swaps, same }
}

/** The one-op swap: the entity keeps its id and its transform; only media.assetId moves. */
export const swapOps = (swap, asset) => [
    { type: 'upsertAsset', payload: { asset } },
    { type: 'updateComponent', payload: { entityId: swap.entity.id, component: 'media', patch: { assetId: asset.id } } }
]

export const exitCodeFor = (refused, allowSkips) => (refused.length && !allowSkips ? 2 : 0)

/** Everything the run does, with the client handed in so a test can stand in for the server. */
export const runAddSources = async ({ client, space, projectId, files, dryRun = false, originals = false, say: out = say, warn: bad = warn }) => {
    const current = must(await client.get(`/api/projects/${projectId}/document`), `reading ${projectId}`)
    const document = current.document || {}
    const { fresh, skipped } = planFiles(files, document)
    skipped.forEach((entry) => out(`  skip  ${entry.name} — ${entry.why}`))
    const { swaps, same } = originals ? planSwaps(skipped, document) : { swaps: [], same: [] }
    same.forEach((entry) => out(`  keep  ${entry.name} — hung ${fmtBytes(entry.oldSize)}, file here ${fmtBytes(entry.newSize)}, not larger`))
    const { firstRow } = nextWallSlot(document)
    out(`  ${wallEntities(document).length} pictures hang now; new rows start at row ${firstRow + 1} from the bottom`)

    if (dryRun) {
        const stub = fresh.map((file) => ({ id: 'pending', name: path.basename(file), mimeType: '' }))
        const ops = addOps(stub, document)
        fresh.forEach((file, k) => {
            const [x, y] = ops[k].payload.entity.components.transform.position
            out(`  would upload+hang  ${path.basename(file)} (${fmtBytes(fs.statSync(file).size)}) as ${ops[k].payload.entity.id} at x ${x.toFixed(2)}, height ${y.toFixed(2)}`)
        })
        swaps.forEach((swap) => out(`  would swap  ${swap.name}: ${fmtBytes(swap.oldSize)} on the wall -> ${fmtBytes(swap.newSize)} original, entity ${swap.entity.id} stays where it hangs`))
        out(`[dry run] ${fresh.length} would be hung, ${swaps.length} swapped to the original, ${skipped.length} skipped, nothing changed`)
        return { hung: [], skipped, refused: [], dryRun: true, planned: fresh.length, plannedSwaps: swaps.length }
    }

    const refused = []
    const carried = []
    for (const file of fresh) {
        const asset = await uploadAsset(client, projectId, file, {
            skippable: true,
            onRefused: (entry) => refused.push(entry)
        })
        if (asset) carried.push(asset)
    }
    if (carried.length) {
        await sendOps(client, projectId, [
            ...carried.map((asset) => ({ type: 'upsertAsset', payload: { asset } })),
            // sendOps reads a fresh baseVersion; the entities were laid out from
            // the document read above, and nothing else writes a wall in the time between.
            ...addOps(carried, document)
        ])
    }

    const swapped = []
    for (const swap of swaps) {
        const asset = await uploadAsset(client, projectId, swap.file, { skippable: true, onRefused: (entry) => refused.push(entry) })
        if (!asset) continue
        await sendOps(client, projectId, swapOps(swap, asset))
        // Drop the old asset only once the document reads back with the entity on the new one.
        const back = must(await client.get(`/api/projects/${projectId}/document`), `reading ${projectId} back`).document || {}
        const entity = (back.entities || []).find((e) => e.id === swap.entity.id)
        const stillUsed = (back.entities || []).some((e) => e.components?.media?.assetId === swap.asset.id)
        if (entity?.components?.media?.assetId === asset.id && (back.assets || []).some((a) => a.id === asset.id)) {
            if (!stillUsed) await sendOps(client, projectId, [{ type: 'deleteAsset', payload: { assetId: swap.asset.id } }])
            swapped.push({ name: swap.name, entityId: swap.entity.id, oldSize: swap.oldSize, newSize: asset.size })
        } else {
            bad(`  NOT DROPPED ${swap.name}: the new asset did not read back, the old one is kept`)
            refused.push({ name: swap.name, size: swap.newSize, status: 0, reason: 'swap did not read back' })
        }
    }
    swapped.forEach((e) => out(`  swapped ${e.name}: ${fmtBytes(e.oldSize)} -> ${fmtBytes(e.newSize)} (${e.entityId})`))
    out(`  ${carried.length} hung, ${swapped.length} swapped to the original, ${skipped.length} skipped, ${refused.length} refused`)
    refused.forEach((entry) => bad(`  REFUSED ${entry.name} · ${fmtBytes(entry.size)} · HTTP ${entry.status} ${entry.reason}`))
    return { hung: carried, swapped, skipped, refused, dryRun: false }
}

const main = async () => {
    const args = parseArgs()
    const dir = args['add-sources'] && args['add-sources'] !== true ? path.resolve(String(args['add-sources'])) : null
    const space = args.name && args.name !== true ? String(args.name).trim() : null
    if (!dir || !space) die('add-sources.mjs needs --add-sources <dir> and --name <space>.')
    if (!fs.existsSync(dir)) die(`No folder at ${dir}.`)
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const projectId = String(args['sources-project'] || sourcesProjectId(space))
    const files = walkFiles(dir)
        .filter((file) => {
            const ext = path.extname(file).toLowerCase()
            return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)
        })
        .sort()
    const token = readToken(args['token-file'] ? String(args['token-file']) : null)
    if (!token) die('No API token found, so nothing was sent.', 'Set DI_API_TOKEN, or pass --token-file <env file>.')
    say(`Space "${space}", project ${projectId} on ${api} — ${files.length} files in ${dir}`)
    const result = await runAddSources({ client: makeClient(api, token), space, projectId, files, dryRun: Boolean(args['dry-run']), originals: Boolean(args.originals) })
    const code = exitCodeFor(result.refused, Boolean(args['allow-skips']))
    if (code) warn(`\n${result.refused.length} file(s) refused — exit ${code}. Re-run with --allow-skips to accept that.`)
    process.exit(code)
}

if (process.argv[1] && process.argv[1].endsWith('add-sources.mjs')) await main()
