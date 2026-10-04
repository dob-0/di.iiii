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

export const exitCodeFor = (refused, allowSkips) => (refused.length && !allowSkips ? 2 : 0)

/** Everything the run does, with the client handed in so a test can stand in for the server. */
export const runAddSources = async ({ client, space, projectId, files, dryRun = false, say: out = say, warn: bad = warn }) => {
    const current = must(await client.get(`/api/projects/${projectId}/document`), `reading ${projectId}`)
    const document = current.document || {}
    const { fresh, skipped } = planFiles(files, document)
    skipped.forEach((entry) => out(`  skip  ${entry.name} — ${entry.why}`))
    const { firstRow } = nextWallSlot(document)
    out(`  ${wallEntities(document).length} pictures hang now; new rows start at row ${firstRow + 1} from the bottom`)

    if (dryRun) {
        const stub = fresh.map((file) => ({ id: 'pending', name: path.basename(file), mimeType: '' }))
        const ops = addOps(stub, document)
        fresh.forEach((file, k) => {
            const [x, y] = ops[k].payload.entity.components.transform.position
            out(`  would upload+hang  ${path.basename(file)} (${fmtBytes(fs.statSync(file).size)}) as ${ops[k].payload.entity.id} at x ${x.toFixed(2)}, height ${y.toFixed(2)}`)
        })
        out(`[dry run] ${fresh.length} would be hung, ${skipped.length} skipped, nothing changed`)
        return { hung: [], skipped, refused: [], dryRun: true, planned: fresh.length }
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
    out(`  ${carried.length} hung, ${skipped.length} skipped, ${refused.length} refused`)
    refused.forEach((entry) => bad(`  REFUSED ${entry.name} · ${fmtBytes(entry.size)} · HTTP ${entry.status} ${entry.reason}`))
    return { hung: carried, skipped, refused, dryRun: false }
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
    const result = await runAddSources({ client: makeClient(api, token), space, projectId, files, dryRun: Boolean(args['dry-run']) })
    const code = exitCodeFor(result.refused, Boolean(args['allow-skips']))
    if (code) warn(`\n${result.refused.length} file(s) refused — exit ${code}. Re-run with --allow-skips to accept that.`)
    process.exit(code)
}

if (process.argv[1] && process.argv[1].endsWith('add-sources.mjs')) await main()
