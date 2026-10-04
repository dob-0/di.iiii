#!/usr/bin/env node
/**
 * add-files.mjs — ANY kind of file into one project, with a provenance list.
 *
 * add-sources.mjs hangs photographs and video on a wall. A production also owns
 * files that are not pictures: the makers' manuals (PDF), an equipment order
 * (CSV, PDF), a patch for the lighting desk (MVR, GDTF), sketches (HTML),
 * research (Markdown), scan meshes (GLB, OBJ). They belong in a project of
 * their own, private, as FILES — not as scene objects.
 *
 * How di.iiii already holds such a file (read from the code, not invented):
 * a project's `document.assets` list IS the Files panel (AssetsPanel in
 * src/studio/components/StudioShellPanels.jsx, residency "project"). An
 * `upsertAsset` op puts the file there; the upload route stores the bytes under
 * their sha256. A PDF in that list is turned into image pages only when someone
 * presses "+ Add" (handleCreateFromAsset → pdfToImageFiles in
 * src/studio/utils/assetFormats.js); the other kinds are "stored and usable by
 * URL" (ASSET_FORMAT_HINT). So this writes assets and NO entities, no new type.
 *
 * Why the project must be private, and why NOT the space's file list: on a
 * public space `GET /api/spaces/<id>/assets` is public, but a PRIVATE project's
 * document and asset URLs answer visitors with 404. `--create-private` creates
 * the project with visibility 'private' in the SAME request, and every write
 * refuses to start until the project is read back as private.
 *
 * Usage:
 *   node scripts/place/add-files.mjs --manifest <file.json> --name <space> --project <id> [options]
 *
 *   --manifest <file>        what goes in: groups of folders with a source and a licence note each
 *                            (scripts/place/manifests/moxir-documents.json is the real one)
 *   --create-private         create the project private if it does not exist; title from --title
 *   --title <text>           the project's title (with --create-private)
 *   --api <base>             target API base, with its mount (dev: https://dev.diiii.xyz/serverXR)
 *   --token-file <file>      env file holding the target's token; --token-key <KEY> names the line
 *   --from-space-api <base>  also pull the SPACE files of that install (the manifest's `spaceFiles`) into --stage
 *   --from-token-file/-key   same, for the source install (default: the installed di's own env file)
 *   --stage <dir>            where pulled space files are kept on this machine
 *   --media-json <file>      src/rigbuild/items/media.json — the maker page, title and date for each manual's sha256
 *   --dedupe-space           leave out a file the space's OTHER projects already hold (same sha256 as an asset id, or
 *                            same name and size)
 *   --max-bytes <n>          refuse a file bigger than this without trying (default 100 MB, Cloudflare's 413 line)
 *   --dry-run                read everything, print the plan and the provenance list, change nothing on the target
 *   --allow-skips            exit 0 even if the server refused a file
 *
 * Exit: 0 all done · 1 something failed · 2 a file was refused (and no --allow-skips).
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'

import { parseArgs, say, warn, die, fmtBytes, walkFiles } from './common.mjs'
import { makeClient } from './api.mjs'
import { uploadAsset, sendOps, must } from './import.mjs'

export const DEFAULT_MAX_BYTES = 100 * 1000 * 1000
export const PROVENANCE_NAME = 'PROVENANCE.md'

const MIME = {
    '.pdf': 'application/pdf', '.csv': 'text/csv', '.md': 'text/markdown', '.html': 'text/html',
    '.json': 'application/json', '.txt': 'text/plain', '.log': 'text/plain', '.mp4': 'video/mp4',
    '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain', '.mtl': 'text/plain',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.exr': 'application/octet-stream', '.mvr': 'application/octet-stream', '.gdtf': 'application/octet-stream',
    '.mg': 'application/json', '.xml': 'application/xml'
}
export const mimeOf = (name) => MIME[path.extname(String(name)).toLowerCase()] || 'application/octet-stream'

const expandHome = (p) => (String(p).startsWith('~') ? path.join(os.homedir(), String(p).slice(1)) : String(p))

export const sha256File = (file) => {
    const hash = crypto.createHash('sha256')
    const fd = fs.openSync(file, 'r')
    const buffer = Buffer.alloc(1 << 20)
    try {
        for (;;) {
            const n = fs.readSync(fd, buffer, 0, buffer.length, null)
            if (!n) break
            hash.update(buffer.subarray(0, n))
        }
    } finally {
        fs.closeSync(fd)
    }
    return hash.digest('hex')
}

/** The asset name for a file: `<prefix>--<relative path, slashes as __>`, so two folders can both hold a patch.csv. */
export const assetNameFor = (group, rel) => {
    const flat = rel.split(path.sep).join('/').replace(/\//g, '__')
    return group.prefix ? `${group.prefix}--${flat}` : flat
}

/** Folders and files of the manifest → one entry per file, with sha256, size, date. Missing folders are reported, not skipped silently. */
export const expandManifest = (manifest, { sha = sha256File } = {}) => {
    const entries = []
    const missing = []
    const excluded = []
    for (const group of manifest.groups || []) {
        const dir = path.resolve(expandHome(group.dir))
        if (!fs.existsSync(dir)) {
            missing.push({ group: group.id, dir })
            continue
        }
        const include = (group.include || []).map((r) => new RegExp(r, 'i'))
        const exclude = (group.exclude || []).map((r) => new RegExp(r, 'i'))
        const files = fs.statSync(dir).isDirectory() ? walkFiles(dir) : [dir]
        for (const abs of files) {
            const rel = fs.statSync(dir).isDirectory() ? path.relative(dir, abs) : path.basename(abs)
            if ((include.length && !include.some((re) => re.test(rel))) || exclude.some((re) => re.test(rel))) {
                excluded.push({ group: group.id, path: abs })
                continue
            }
            const stat = fs.statSync(abs)
            entries.push({
                group: group.id, abs, rel, name: assetNameFor(group, rel), size: stat.size,
                mtime: stat.mtime.toISOString().slice(0, 10), sha256: sha(abs),
                source: group.source || '', licence: group.licence || '', note: group.note || ''
            })
        }
    }
    return { entries, missing, excluded }
}

/** sha256 → the maker's page, title and date, from src/rigbuild/items/media.json (metadata only; the files are not in the repo). */
export const mediaIndex = (media) => {
    const index = new Map()
    for (const [item, value] of Object.entries(media?.items || {})) {
        for (const doc of value.media || []) {
            if (doc?.sha256 && !index.has(doc.sha256)) {
                index.set(doc.sha256, { item, maker: doc.maker, title: doc.title, kind: doc.kind, page: doc.page || doc.url, fetched: doc.fetched })
            }
        }
    }
    return index
}

/** Space files of one install → entries (bytes pulled into `stage`), the provenance filled from the media index where it knows the sha256. */
export const pullSpaceFiles = async ({ client, space, stage, spec, index = new Map() }) => {
    fs.mkdirSync(stage, { recursive: true })
    const listed = must(await client.get(`/api/spaces/${space}/assets`), `listing the space files of ${space}`)
    const entries = []
    for (const asset of listed.assets || []) {
        const dest = path.join(stage, asset.name)
        if (!(fs.existsSync(dest) && fs.statSync(dest).size === Number(asset.size))) {
            const got = await client.bytes(`/api/spaces/${space}/assets/${asset.id}`)
            if (!got.ok) throw new Error(`pulling ${asset.name}: HTTP ${got.status}`)
            fs.writeFileSync(dest, got.buffer)
        }
        const sha = sha256File(dest)
        const known = index.get(sha)
        entries.push({
            group: 'maker-manuals', abs: dest, originalPath: known?.page || `space file ${asset.id} on the installed di`, rel: asset.name, name: asset.name, size: fs.statSync(dest).size,
            mtime: new Date(Number(asset.createdAt) || Date.now()).toISOString().slice(0, 10), sha256: sha,
            source: known
                ? `maker's website — ${known.maker}, "${known.title}" (${known.kind}), ${known.page}, fetched ${known.fetched} (media.json, rental item ${known.item})`
                : (spec.source || "maker's website; the page is not recorded for this file"),
            licence: spec.licence || '', note: `held as a SPACE file on the installed di; local space asset id ${asset.id}`
        })
    }
    return entries
}

/** What the target project (and, with --dedupe-space, its sibling projects) already hold. */
export const heldBy = (documents) => {
    const names = new Map()
    const ids = new Map()
    const sized = new Map()
    for (const { project, document } of documents) {
        for (const asset of document?.assets || []) {
            names.set(String(asset.name).toLowerCase(), project)
            ids.set(String(asset.id).toLowerCase(), { project, name: asset.name })
            sized.set(`${String(asset.name).toLowerCase()}|${asset.size}`, project)
        }
    }
    return { names, ids, sized }
}

/**
 * Sort the entries: new · already in the target (by name) · a duplicate (same sha256 as an asset elsewhere or an
 * earlier entry, or same name+size in a sibling project) · refused (over the size line).
 */
export const planFiles = (entries, { target = [], siblings = [], maxBytes = DEFAULT_MAX_BYTES } = {}) => {
    const here = heldBy(target)
    const elsewhere = heldBy(siblings)
    const seen = new Map()
    const plan = { fresh: [], present: [], duplicate: [], refused: [] }
    for (const entry of entries) {
        const key = entry.name.toLowerCase()
        if (here.names.has(key)) { plan.present.push({ ...entry, why: 'a file of this name is already in the project' }); continue }
        if (entry.size > maxBytes) {
            plan.refused.push({ ...entry, status: 413, reason: `${fmtBytes(entry.size)} is over the ${fmtBytes(maxBytes)} line (Cloudflare refuses a request body over 100 MB); not tried, not split` })
            continue
        }
        if (seen.has(`name:${key}`)) {
            plan.refused.push({ ...entry, status: 0, reason: `a different file already has the name ${entry.name} in this run; the manifest needs another prefix` })
            continue
        }
        const holder = here.ids.get(entry.sha256) || elsewhere.ids.get(entry.sha256)
        if (holder) { plan.duplicate.push({ ...entry, why: `same sha256 as ${holder.name} in ${holder.project}` }); continue }
        const sibling = elsewhere.sized.get(`${key}|${entry.size}`)
        if (sibling) { plan.duplicate.push({ ...entry, why: `same name and size as a file in ${sibling}` }); continue }
        if (seen.has(entry.sha256)) { plan.duplicate.push({ ...entry, why: `same bytes as ${seen.get(entry.sha256)} (listed once)` }); continue }
        seen.set(entry.sha256, entry.name)
        seen.set(`name:${key}`, true)
        plan.fresh.push(entry)
    }
    return plan
}

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** The provenance list: one row per file, with what happened to it. */
export const provenanceMd = ({ title, space, project, date, plan, uploaded = {}, refused = [], manifest = {}, notes = [] }) => {
    const rows = []
    const row = (entry, status) => rows.push(
        `| ${cell(entry.name)} | ${cell(entry.originalPath || entry.abs)} | ${entry.sha256} | ${entry.size} | ${entry.mtime} | ${cell(entry.source)} | ${cell(entry.licence)}${entry.note ? ` — ${cell(entry.note)}` : ''} | ${status} |`
    )
    plan.fresh.forEach((e) => row(e, uploaded[e.name] ? 'in this project' : 'planned'))
    refused.forEach((e) => row(e, `REFUSED HTTP ${e.status}: ${cell(e.reason)}`))
    plan.present.forEach((e) => row(e, 'already in this project'))
    plan.duplicate.forEach((e) => row(e, `not added — ${cell(e.why)}`))
    plan.refused.forEach((e) => row(e, `REFUSED ${cell(e.reason)}`))
    return [
        `# ${title || project} — provenance`,
        '',
        `Project \`${project}\` in space \`${space}\`, written ${date} by \`scripts/place/add-files.mjs\`.`,
        '',
        '**Private.** Kept for the production team. Nothing here is public: the project is private, and a visitor gets 404 on its document and files.',
        ...(manifest.licenceNote ? ['', manifest.licenceNote] : []),
        ...notes.length ? ['', ...notes] : [],
        '',
        'Every row: the name the file has here, the path (or page) it came from, its sha256, size in bytes, its date, its source, the licence note, and what happened to it.',
        '',
        '| file | original path | sha256 | bytes | date | source | licence | status |',
        '|---|---|---|---|---|---|---|---|',
        ...rows,
        ''
    ].join('\n')
}

/** Read a `KEY=value` line out of an env file; the value is returned, never printed. */
export const readEnvKey = (file, key) => {
    try {
        const line = fs.readFileSync(expandHome(file), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
        return line ? line.slice(key.length + 1).trim() : null
    } catch {
        return null
    }
}

/** The hottest CPU sensor in °C, or null when none can be read. */
export const cpuTemp = () => {
    let hottest = null
    try {
        for (const hw of fs.readdirSync('/sys/class/hwmon')) {
            for (const f of fs.readdirSync(`/sys/class/hwmon/${hw}`).filter((n) => /^temp\d+_input$/.test(n))) {
                const t = Number(fs.readFileSync(`/sys/class/hwmon/${hw}/${f}`, 'utf8')) / 1000
                if (Number.isFinite(t) && (hottest === null || t > hottest)) hottest = t
            }
        }
    } catch { /* no sensors */ }
    return hottest
}

const projectVisibility = async (client, space, projectId) => {
    const listed = must(await client.get(`/api/spaces/${space}/projects`), `listing the projects of ${space}`)
    const found = (listed.projects || []).find((p) => p.id === projectId)
    return found ? (found.visibility === 'private' ? 'private' : 'public') : null
}

/**
 * Everything the run does, the client handed in so a test can stand in for the server.
 * Order: read → (create private) → assert private → upload each → ops → PROVENANCE.md → read back.
 */
export const runAddFiles = async ({
    client, space, projectId, title, entries, createPrivate = false, dryRun = false, dedupeSpace = false,
    maxBytes = DEFAULT_MAX_BYTES, manifest = {}, notes = [], say: out = say, warn: bad = warn, today = new Date().toISOString().slice(0, 10),
    pause = async () => {}
}) => {
    let visibility = await projectVisibility(client, space, projectId)
    if (visibility === null && !createPrivate) die(`No project "${projectId}" in ${space}.`, 'Pass --create-private to create it (private).')
    let target = []
    if (visibility !== null) {
        const doc = must(await client.get(`/api/projects/${projectId}/document`), `reading ${projectId}`)
        target = [{ project: projectId, document: doc.document || {} }]
    }
    let siblings = []
    if (dedupeSpace) {
        const listed = must(await client.get(`/api/spaces/${space}/projects`), 'listing projects')
        for (const p of listed.projects || []) {
            if (p.id === projectId) continue
            const doc = await client.get(`/api/projects/${p.id}/document`)
            if (doc.ok) siblings.push({ project: p.id, document: doc.body?.document || {} })
        }
    }
    const plan = planFiles(entries, { target, siblings, maxBytes })
    const total = plan.fresh.reduce((n, e) => n + e.size, 0)
    plan.present.forEach((e) => out(`  skip  ${e.name} — ${e.why}`))
    plan.duplicate.forEach((e) => out(`  dup   ${e.name} — ${e.why}`))
    plan.refused.forEach((e) => out(`  REFUSED ${e.name} — ${e.reason}`))

    if (dryRun) {
        out(`  project ${projectId}: ${visibility === null ? 'would be created PRIVATE' : `exists, ${visibility}`}`)
        plan.fresh.forEach((e) => out(`  would upload  ${e.name} (${fmtBytes(e.size)}, ${mimeOf(e.name)})`))
        const md = provenanceMd({ title, space, project: projectId, date: today, plan, manifest, notes })
        out(`[dry run] ${plan.fresh.length} would go in (${fmtBytes(total)}), ${plan.present.length} already there, ${plan.duplicate.length} duplicates, ${plan.refused.length} refused over the size line; ${PROVENANCE_NAME} would list ${plan.fresh.length + plan.present.length + plan.duplicate.length + plan.refused.length} files; nothing changed`)
        return { dryRun: true, plan, provenance: md, refused: plan.refused, uploaded: [] }
    }

    if (visibility === null) {
        const made = await client.post(`/api/spaces/${space}/projects`, { slug: projectId, title: title || projectId, visibility: 'private' })
        must(made, `creating ${projectId}`)
        out(`  created ${projectId}`)
        visibility = await projectVisibility(client, space, projectId)
    }
    // The hard line: nothing is written until the server says private. If it does not, the project is left empty and the run stops.
    if (visibility !== 'private') die(`Project ${projectId} reads back as "${visibility}", not private — nothing was uploaded.`, 'Set it private in Studio, then run again.')
    out(`  ${projectId} reads back PRIVATE`)

    const refused = [...plan.refused]
    const carried = []
    for (const entry of plan.fresh) {
        await pause()
        const asset = await uploadAsset(client, projectId, entry.abs, {
            skippable: true, name: entry.name, mimeType: mimeOf(entry.name), onRefused: (r) => refused.push({ ...entry, status: r.status, reason: r.reason })
        })
        if (asset) { carried.push({ entry, asset }); out(`  up    ${entry.name} (${fmtBytes(entry.size)})`) }
    }
    if (carried.length) await sendOps(client, projectId, carried.map(({ asset }) => ({ type: 'upsertAsset', payload: { asset } })))

    // PROVENANCE.md last, so it can say what happened; replaces an earlier one of the same name.
    const uploaded = Object.fromEntries(carried.map(({ entry }) => [entry.name, true]))
    const runtimeRefused = refused.filter((r) => !plan.refused.includes(r))
    const mdFull = provenanceMd({ title, space, project: projectId, date: today, plan: { ...plan, fresh: carried.map((c) => c.entry) }, uploaded, refused: runtimeRefused, manifest, notes })
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'add-files-')), PROVENANCE_NAME)
    fs.writeFileSync(tmp, mdFull)
    const provAsset = await uploadAsset(client, projectId, tmp, { skippable: true, name: PROVENANCE_NAME, mimeType: 'text/markdown', onRefused: (r) => refused.push({ name: PROVENANCE_NAME, size: fs.statSync(tmp).size, status: r.status, reason: r.reason }) })
    if (provAsset) {
        const before = must(await client.get(`/api/projects/${projectId}/document`), 'reading before provenance').document || {}
        const stale = (before.assets || []).filter((a) => a.name === PROVENANCE_NAME && a.id !== provAsset.id)
        await sendOps(client, projectId, [{ type: 'upsertAsset', payload: { asset: provAsset } }, ...stale.map((a) => ({ type: 'deleteAsset', payload: { assetId: a.id } }))])
    }

    // Read-back: every asset the run meant to put in is in the document; for files the server does not re-encode, the bytes hash to the id.
    const back = must(await client.get(`/api/projects/${projectId}/document`), `reading ${projectId} back`).document || {}
    const have = new Map((back.assets || []).map((a) => [a.name, a]))
    const missing = carried.filter(({ entry }) => !have.has(entry.name)).map(({ entry }) => entry.name)
    const changed = []
    for (const { entry, asset } of carried) {
        if (!have.has(entry.name)) continue
        if (/^image\/(jpeg|png|webp)$/.test(mimeOf(entry.name))) continue // the server re-encodes these (scrub); the id differs by design
        if (asset.id !== entry.sha256) changed.push(entry.name)
    }
    missing.forEach((n) => bad(`  READ-BACK MISSING ${n}`))
    changed.forEach((n) => bad(`  READ-BACK id differs from sha256 ${n}`))
    out(`  ${carried.length} uploaded, ${plan.present.length} already there, ${plan.duplicate.length} duplicates, ${refused.length} refused; document now lists ${(back.assets || []).length} files`)
    refused.forEach((r) => bad(`  REFUSED ${r.name} · ${fmtBytes(r.size)} · HTTP ${r.status} ${r.reason}`))
    return { dryRun: false, plan, uploaded: carried.map((c) => c.entry), refused, missing, changed, documentAssets: (back.assets || []).length, provenance: mdFull }
}

const main = async () => {
    const args = parseArgs()
    const str = (k) => (args[k] && args[k] !== true ? String(args[k]) : null)
    const manifestFile = str('manifest')
    const space = str('name')
    const projectId = str('project')
    if (!manifestFile || !space || !projectId) die('add-files.mjs needs --manifest <file>, --name <space> and --project <id>.')
    const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestFile), 'utf8'))
    const api = (str('api') || 'https://local.thedi.studio/serverXR').replace(/\/$/, '')
    const token = readEnvKey(str('token-file') || '~/.di/di.env', str('token-key') || 'API_TOKEN') || process.env.DI_API_TOKEN
    if (!token) die('No API token found, so nothing was sent.', 'Pass --token-file <env file> and --token-key <KEY>.')

    const index = str('media-json') ? mediaIndex(JSON.parse(fs.readFileSync(path.resolve(str('media-json')), 'utf8'))) : new Map()
    const { entries, missing, excluded } = expandManifest(manifest)
    say(`Space "${space}", project ${projectId} on ${api} — ${entries.length} files from ${(manifest.groups || []).length} folders; ${excluded.length} left out by the manifest's own rules`)
    missing.forEach((m) => warn(`  MISSING FOLDER ${m.group}: ${m.dir}`))
    const all = [...entries]
    if (str('from-space-api')) {
        const sourceToken = readEnvKey(str('from-token-file') || '~/.di/di.env', str('from-token-key') || 'ADMIN_API_TOKEN') || readEnvKey('~/.di/di.env', 'API_TOKEN')
        if (!sourceToken) die('No token for the source install.')
        const pulled = await pullSpaceFiles({
            client: makeClient(str('from-space-api').replace(/\/$/, ''), sourceToken), space,
            stage: path.resolve(expandHome(str('stage') || path.join(os.tmpdir(), 'add-files-stage'))), spec: manifest.spaceFiles || {}, index
        })
        say(`  pulled ${pulled.length} space files from ${str('from-space-api')}`)
        all.push(...pulled)
    }
    const pauseWhenHot = async () => {
        for (;;) {
            const t = cpuTemp()
            if (t === null || t <= 85) return
            warn(`  CPU ${t.toFixed(0)} C > 85 C — paused 30 s`)
            await new Promise((r) => setTimeout(r, 30000))
        }
    }
    const notes = [
        ...(missing.length ? [`Folders in the manifest that were not on disk: ${missing.map((m) => m.dir).join(', ')}`] : []),
        ...(manifest.notes || [])
    ]
    const result = await runAddFiles({
        client: makeClient(api, token), space, projectId, title: str('title') || manifest.title, entries: all,
        createPrivate: Boolean(args['create-private']), dryRun: Boolean(args['dry-run']), dedupeSpace: Boolean(args['dedupe-space']),
        maxBytes: Number(str('max-bytes')) || DEFAULT_MAX_BYTES, manifest, notes, pause: pauseWhenHot
    })
    if (str('write-provenance')) fs.writeFileSync(path.resolve(str('write-provenance')), result.provenance)
    const code = result.refused.length && !args['allow-skips'] ? 2 : (result.missing?.length || result.changed?.length ? 1 : 0)
    if (code) warn(`\nexit ${code}: ${result.refused.length} refused, ${result.missing?.length || 0} missing on read-back, ${result.changed?.length || 0} id mismatches.`)
    process.exit(code)
}

if (process.argv[1] && process.argv[1].endsWith('add-files.mjs')) await main()
