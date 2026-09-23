/**
 * space-bundle.mjs — export a space to a portable bundle, or import one.
 *
 * A bundle is a tar.gz holding everything a space is made of — DB rows
 * (spaces, space_ops, projects, project_ops, public_assets), scene.json,
 * space-level assets, per-project documents + asset refs, the CAS blob
 * store, and the space's light show (lighting/show.json, the lighting desk's
 * patch, scenes, looks and MIDI map) — so a space can be moved to another
 * install (or archived) without a running source server. Sync keys and GitHub
 * links are stripped: they carry secrets and host-specific bindings. So is the
 * light show's `output` (which wire, which addresses): that is the machine's
 * rig, and a file opened elsewhere must not send light at this venue's nodes.
 *
 * Usage:
 *   node scripts/space-bundle.mjs export <spaceId> [options]
 *   node scripts/space-bundle.mjs import <bundle.tar.gz> [options]
 *
 * Options (both):
 *   --data-root <dir>   serverXR data root (default: $DATA_ROOT or serverXR/data)
 *
 * Export options:
 *   --out <file>        Output path (default: <spaceId>.space-bundle.tar.gz)
 *
 * Import options:
 *   --as <newId>        Import under a different space id (slug, 3-48 chars)
 *   --owner <userId>    Set owner_user_id (default: none — original owner
 *                       ids are dropped; they reference users of the source install)
 *   --force             Overwrite an existing space with the same id
 *   --tier <name>       With --force on a hosted tier: say which tier you mean
 *                       (dev | prod). Refused when it is not the tier this
 *                       data belongs to — see tierOfThisInstall().
 *   --prune             With --force: also DELETE the target's projects that
 *                       are not in the bundle. Without it they are kept.
 *   --no-backup         With --force: skip the automatic before-copy
 *   --force-stale       Also overwrite when the TARGET changed after this
 *                       bundle was exported (--force alone still refuses
 *                       that — see the staleness check in importSpace)
 */

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Dynamic, not static — a static `import … from 'node:sqlite'` makes Vite's
// test transform try to bundle the built-in and fail outright the moment
// anything (a test file) imports this module, even without ever calling
// exportSpace. gc-space-blobs.mjs hit the same thing; same fix.

const require = createRequire(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Where the server's source is, seen from this script. Two layouts exist:
//   - a checkout or an installed runtime: <root>/scripts/ beside <root>/serverXR/src/
//   - the server image (serverXR/Dockerfile): the server IS the root -- /app/src/,
//     with this script copied to /app/scripts/ -- and there is no serverXR/ above it.
// The routes that save a space to a file and open one spawn this script. From
// the day they shipped (2026-08-19) to 2026-09-17 the image did not carry it, so
// every hosted tier answered "Could not save this space to a file." -- and once
// it did, a hardcoded ../serverXR/src would have failed one step later, inside
// the image. Checked by "runs from the server image's layout" in the test file.
const SERVER_SRC = ['serverXR/src', 'src']
    .map((dir) => path.join(ROOT_DIR, dir))
    .find((dir) => fs.existsSync(path.join(dir, 'db.js')))
    || path.join(ROOT_DIR, 'serverXR', 'src')

const BUNDLE_FORMAT = 'di.space-bundle'
// The newest version this tool reads. Version 2 is a file that carries a light show
// (space/lighting/show.json). A file without one is still written as 1, so every
// di.iiii that opens files today still opens it; a file with one is refused BY NAME
// by an older di.iiii — "newer than this tool" — instead of opening with the show
// silently left behind, which is the one failure a file format must not have.
const BUNDLE_VERSION = 2
const LIGHT_SHOW_VERSION = 2

// The document extension. A space bundle is to di.iiii what a .blend is to
// Blender — one file holding everything the work is made of, portable to any
// other install — and `my-show.space-bundle.tar.gz` did not read like a
// document anyone owns. The old name is still accepted on import: files that
// already exist keep opening, which is the entire point of a file format.
// Import takes any path, so files already written as `.space-bundle.tar.gz`
// keep opening with no special case — which is the entire point of a format.
const BUNDLE_EXT = '.diiii'

// What wrote this file. Recorded so that an install can tell an old file (open
// it) from one written by a version newer than itself (refuse it BY NAME rather
// than half-importing it and leaving someone to find out later). Same rule the
// database uses — see SCHEMA_VERSION in serverXR/src/db.js.
const writerStamp = () => {
    let appVersion = null
    let schemaVersion = null
    try {
        const release = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'release.json'), 'utf8'))
        appVersion = release.version ?? null
        schemaVersion = Number.isInteger(release.schemaVersion) ? release.schemaVersion : null
    } catch { /* a dev checkout has no release.json */ }
    if (schemaVersion === null) {
        try {
            const dbSource = fs.readFileSync(path.join(SERVER_SRC, 'db.js'), 'utf8')
            const match = /const SCHEMA_VERSION = (\d+)/.exec(dbSource)
            if (match) schemaVersion = Number(match[1])
        } catch { /* neither — recorded as unknown, which the reader handles */ }
    }
    return { appVersion, schemaVersion }
}
const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const STRIPPED_TABLES = ['space_sync_keys', 'space_links']

const die = (msg) => { console.error(`[space-bundle] ERROR: ${msg}`); process.exit(1) }
const log = (msg) => console.log(`[space-bundle] ${msg}`)

const parseArgs = (argv) => {
    const args = { command: null, target: null, dataRoot: null, out: null, as: null, owner: null, force: false, forceStale: false, prune: false, noBackup: false, tier: null }
    const positional = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--data-root') args.dataRoot = argv[++i]
        else if (a === '--out') args.out = argv[++i]
        else if (a === '--as') args.as = argv[++i]
        else if (a === '--owner') args.owner = argv[++i]
        else if (a === '--force') args.force = true
        else if (a === '--prune') args.prune = true
        else if (a === '--tier') args.tier = argv[++i]
        else if (a === '--no-backup') args.noBackup = true
        // --force alone still refuses when the target changed AFTER this
        // bundle was exported (see importSpace) — this is the second,
        // explicit word needed to overwrite that too.
        else if (a === '--force-stale') args.forceStale = true
        else if (a.startsWith('--')) die(`unknown option ${a}`)
        else positional.push(a)
    }
    args.command = positional[0] || null
    args.target = positional[1] || null
    return args
}

const resolvePaths = (dataRoot) => {
    const root = path.resolve(ROOT_DIR, dataRoot || process.env.DATA_ROOT || 'serverXR/data')
    return {
        dataRoot: root,
        spacesDir: process.env.SPACES_DIR ? path.resolve(ROOT_DIR, process.env.SPACES_DIR) : path.join(root, 'spaces'),
        dbPath: process.env.DB_PATH ? path.resolve(ROOT_DIR, process.env.DB_PATH) : path.join(root, 'di.db')
    }
}

const copyDirIfExists = async (from, to) => {
    if (!fs.existsSync(from)) return false
    await fsp.cp(from, to, { recursive: true })
    return true
}

const writeJsonl = async (file, rows) => {
    await fsp.writeFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
}

const readJsonl = async (file) => {
    if (!fs.existsSync(file)) return []
    const text = await fsp.readFile(file, 'utf8')
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

const readJson = async (file) => JSON.parse(await fsp.readFile(file, 'utf8'))

// The space's light show, as the lighting desk keeps it beside the space's scene
// (serverXR/src/lighting/desk.js): the newest complete copy, in the order the desk
// itself reads — the file, a finished temp file whose rename was interrupted, the
// previous save. Never the rig (see the header). Null when the space has no show.
const readLightShow = (spaceDir) => {
    const dir = path.join(spaceDir, 'lighting')
    const main = path.join(dir, 'show.json')
    for (const file of [main, `${main}.tmp`, path.join(dir, 'show.prev.json')]) {
        if (!fs.existsSync(file)) continue
        try {
            const show = JSON.parse(fs.readFileSync(file, 'utf8'))
            if (!show || typeof show !== 'object' || Array.isArray(show)) continue
            delete show.output
            return show
        } catch { /* an unreadable copy: try the next one, as the desk does */ }
    }
    return null
}

const countOf = (show, key) => (Array.isArray(show?.[key]) ? show[key].length : 0)
const describeLightShow = (show) => {
    const n = (count, one) => `${count} ${one}${count === 1 ? '' : 's'}`
    return `light show: ${n(countOf(show, 'fixtures'), 'fixture')}, ${n(countOf(show, 'scenes'), 'scene')}`
}

// ---------------------------------------------------------------- export

async function exportSpace(args) {
    const { spacesDir, dbPath } = resolvePaths(args.dataRoot)
    const spaceId = args.target
    if (!spaceId || !SLUG_REGEX.test(spaceId)) die(`export needs a valid space id, got "${spaceId}"`)
    if (!fs.existsSync(dbPath)) die(`no database at ${dbPath} — wrong --data-root?`)

    const { DatabaseSync } = await import('node:sqlite')
    let db
    try { db = new DatabaseSync(dbPath, { readOnly: true }) }
    catch { db = new DatabaseSync(dbPath) }

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId)
    if (!space) die(`space "${spaceId}" not found in ${dbPath}`)

    const spaceOps = db.prepare('SELECT version, data, created_at FROM space_ops WHERE space_id = ? ORDER BY version ASC').all(spaceId)
    const projects = db.prepare('SELECT * FROM projects WHERE space_id = ? ORDER BY created_at ASC').all(spaceId)
    const selectProjectOps = db.prepare('SELECT version, data, created_at FROM project_ops WHERE project_id = ? ORDER BY version ASC')
    const projectOpsById = new Map(projects.map((p) => [p.id, selectProjectOps.all(p.id)]))
    const commons = db.prepare('SELECT * FROM public_assets WHERE space_id = ?').all(spaceId)
    db.close()

    const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'space-bundle-'))
    try {
        const spaceDir = path.join(spacesDir, spaceId)
        await fsp.mkdir(path.join(staging, 'space'), { recursive: true })

        await fsp.writeFile(path.join(staging, 'space', 'meta.json'), JSON.stringify(space, null, 2))
        await writeJsonl(path.join(staging, 'space', 'ops.jsonl'), spaceOps)
        if (fs.existsSync(path.join(spaceDir, 'scene.json'))) {
            await fsp.copyFile(path.join(spaceDir, 'scene.json'), path.join(staging, 'space', 'scene.json'))
        }
        await copyDirIfExists(path.join(spaceDir, 'assets'), path.join(staging, 'space', 'assets'))
        await copyDirIfExists(path.join(spaceDir, 'blobs'), path.join(staging, 'blobs'))
        const lightShow = readLightShow(spaceDir)
        if (lightShow) {
            await fsp.mkdir(path.join(staging, 'space', 'lighting'), { recursive: true })
            await fsp.writeFile(path.join(staging, 'space', 'lighting', 'show.json'), JSON.stringify(lightShow))
        }

        for (const project of projects) {
            const src = path.join(spaceDir, 'projects', project.id)
            const dst = path.join(staging, 'projects', project.id)
            await fsp.mkdir(dst, { recursive: true })
            await fsp.writeFile(path.join(dst, 'meta.json'), JSON.stringify(project, null, 2))
            await writeJsonl(path.join(dst, 'ops.jsonl'), projectOpsById.get(project.id) ?? [])
            for (const file of ['document.json', 'project.json']) {
                if (fs.existsSync(path.join(src, file))) {
                    await fsp.copyFile(path.join(src, file), path.join(dst, file))
                }
            }
            await copyDirIfExists(path.join(src, 'assets'), path.join(dst, 'assets'))
        }

        if (commons.length) {
            await fsp.writeFile(path.join(staging, 'commons.json'), JSON.stringify(commons, null, 2))
        }

        const stamp = writerStamp()
        const manifest = {
            format: BUNDLE_FORMAT,
            version: lightShow ? LIGHT_SHOW_VERSION : 1,
            spaceId,
            // Which di.iiii wrote this, and what shape its data was in. A file
            // outlives the app that made it; without these an older install
            // cannot tell "old file, open it" from "future file, refuse it".
            writtenBy: stamp.appVersion,
            schemaVersion: stamp.schemaVersion,
            exportedAt: new Date().toISOString(),
            counts: {
                spaceOps: spaceOps.length,
                projects: projects.length,
                commonsAssets: commons.length
            },
            // What the light show holds, so a reader can say it before opening anything.
            lightShow: lightShow
                ? { fixtures: countOf(lightShow, 'fixtures'), scenes: countOf(lightShow, 'scenes'), looks: countOf(lightShow, 'looks') }
                : null,
            stripped: STRIPPED_TABLES
        }
        await fsp.writeFile(path.join(staging, 'bundle.json'), JSON.stringify(manifest, null, 2))

        const out = path.resolve(args.out || `${spaceId}${BUNDLE_EXT}`)
        execFileSync('tar', ['-czf', out, '-C', staging, '.'])
        const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
        log(`exported space "${spaceId}" → ${out} (${size} MB, ${projects.length} projects, ${spaceOps.length} space ops${lightShow ? `, ${describeLightShow(lightShow)}` : ''})`)
        return out
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }
}

// ---------------------------------------------------------------- import

// Space-level asset URLs embed the space id; when importing under a new id,
// rewrite them or media in scene/documents 404s.
const remapSpaceUrls = (text, oldId, newId) =>
    oldId === newId ? text : text.split(`/api/spaces/${oldId}/`).join(`/api/spaces/${newId}/`)

// Which tier is this? A hosted server image carries release.json beside the
// server (`deployEnv`: "production" | "dev"); a checkout or an artist's install
// carries none and is nobody's tier but its own. On 2026-09-17 a collaborator's
// space meant for dev replaced PROD's, because `docker compose` run inside
// /opt/di.iiii-dev quietly addressed the prod containers — and nothing in this
// tool knew, or said, where it was. Now a forced replace on a hosted tier must
// name the tier, and the name must be true.
const tierOfThisInstall = () => {
    for (const file of [path.join(ROOT_DIR, 'release.json'), path.join(ROOT_DIR, 'serverXR', 'release.json')]) {
        try {
            const env = JSON.parse(fs.readFileSync(file, 'utf8')).deployEnv
            if (typeof env === 'string' && env.trim()) return env.trim() === 'production' ? 'prod' : env.trim()
        } catch { /* no release file here */ }
    }
    return null
}

async function importSpace(args) {
    const { dataRoot, spacesDir, dbPath } = resolvePaths(args.dataRoot)
    const bundlePath = args.target && path.resolve(args.target)
    if (!bundlePath || !fs.existsSync(bundlePath)) die(`bundle not found: ${args.target}`)

    const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'space-bundle-'))
    try {
        execFileSync('tar', ['-xzf', bundlePath, '-C', staging])

        const manifestPath = path.join(staging, 'bundle.json')
        if (!fs.existsSync(manifestPath)) die('not a space bundle: bundle.json missing')
        const manifest = await readJson(manifestPath)
        if (manifest.format !== BUNDLE_FORMAT) die(`unknown bundle format "${manifest.format}"`)
        if (manifest.version > BUNDLE_VERSION) {
            die(`bundle version ${manifest.version} is newer than this tool (${BUNDLE_VERSION}) — this file was written by a newer di.iiii${manifest.writtenBy ? ` (${manifest.writtenBy})` : ''}.\n`
                + '  update first:  di update')
        }
        // The light show is read before anything is written, so a broken one refuses
        // the whole file instead of arriving as a space without its show.
        const lightShowSrc = path.join(staging, 'space', 'lighting', 'show.json')
        let lightShowText = null
        if (fs.existsSync(lightShowSrc)) {
            lightShowText = await fsp.readFile(lightShowSrc, 'utf8')
            try {
                const parsed = JSON.parse(lightShowText)
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a show')
                delete parsed.output
                lightShowText = JSON.stringify(parsed)
            } catch (error) {
                die(`this file's light show cannot be read (${error.message}) — nothing was opened`)
            }
        }
        // A file from a newer di.iiii. Refused by name rather than imported
        // partially: the rows would go in and mean something slightly different,
        // which is the failure nobody sees until much later.
        const mine = writerStamp().schemaVersion
        if (Number.isInteger(manifest.schemaVersion) && Number.isInteger(mine) && manifest.schemaVersion > mine) {
            die(`this file was written by a newer di.iiii${manifest.writtenBy ? ` (${manifest.writtenBy})` : ''}.\n`
                + `  the file stores work in shape ${manifest.schemaVersion}; this di.iiii reads ${mine}\n`
                + `  update first:  di update`)
        }

        const sourceId = manifest.spaceId
        const targetId = args.as || sourceId
        if (!SLUG_REGEX.test(targetId)) die(`invalid target space id "${targetId}" (need ${SLUG_REGEX})`)

        const space = await readJson(path.join(staging, 'space', 'meta.json'))
        const spaceOps = await readJsonl(path.join(staging, 'space', 'ops.jsonl'))
        const projectDirs = fs.existsSync(path.join(staging, 'projects'))
            ? (await fsp.readdir(path.join(staging, 'projects'))) : []
        const commons = fs.existsSync(path.join(staging, 'commons.json'))
            ? await readJson(path.join(staging, 'commons.json')) : []

        // initDb creates the full schema on a fresh data root and is a no-op
        // on an existing one — the import works against both.
        await fsp.mkdir(dataRoot, { recursive: true })
        const { initDb, closeDb } = require(path.join(SERVER_SRC, 'db.js'))
        const db = initDb(dbPath)

        const existing = db.prepare('SELECT updated_at, label, owner_user_id FROM spaces WHERE id = ?').get(targetId)
        if (existing && !args.force) die(`space "${targetId}" already exists — use --force to overwrite or --as <newId>`)

        // A whole-replace with no check: --force used to overwrite the target
        // no matter what happened to it since this bundle was made. If the
        // target has been touched (by anyone, through any door) since
        // `bundle.json`'s own `exportedAt`, overwriting it now would discard
        // that work silently — refuse, and require the second, explicit word.
        //
        // `checkStale` is opt-in (only the CLI below sets it): install-bundle.mjs
        // calls importSpace() internally, once per space, as ONE step of
        // restoring an entire estate from a single point-in-time snapshot —
        // there every space's target "changing" milliseconds before its own
        // import is the expected shape of that restore, not a sign someone's
        // concurrent edit is about to be lost. The single-space CLI import
        // this file exposes is the workflow this check exists for.
        if (args.checkStale && existing && args.force && !args.forceStale) {
            const exportedAtMs = Date.parse(manifest.exportedAt)
            const targetUpdatedAtMs = Number(existing.updated_at)
            if (Number.isFinite(exportedAtMs) && Number.isFinite(targetUpdatedAtMs) && targetUpdatedAtMs > exportedAtMs) {
                die(`space "${targetId}" changed after this bundle was exported.\n`
                    + `  bundle exported:      ${manifest.exportedAt}\n`
                    + `  target last touched:  ${new Date(targetUpdatedAtMs).toISOString()}\n`
                    + `  Overwriting now would discard that change. Export a fresh bundle from "${targetId}" instead,\n`
                    + `  or re-run with --force --force-stale to overwrite anyway.`)
            }
        }

        // Replacing a space that is already here. Three things used to be lost
        // without a word (all three met on 2026-09-17/18, moving a collaborator's
        // export between tiers): the target's projects that the file does not
        // carry, its label and owner, and any way back.
        //   - projects not in the file are KEPT unless --prune names the loss;
        //   - a before-copy is written first unless --no-backup;
        //   - label/owner survive (see insertSpace below).
        const bundleProjectIds = new Set(projectDirs)
        const extraProjects = existing
            ? db.prepare('SELECT id, title FROM projects WHERE space_id = ?').all(targetId).filter((p) => !bundleProjectIds.has(p.id))
            : []
        if (existing && args.force && args.checkStale) {
            const here = process.env.DI_TIER_OVERRIDE || tierOfThisInstall()
            const said = args.tier === 'production' ? 'prod' : args.tier
            if (here && said !== here) {
                die(`this is the ${here.toUpperCase()} tier, and "${targetId}" already lives here.\n`
                    + (said ? `  you said --tier ${said}. Nothing was changed.\n` : '')
                    + `  to replace it on ${here}, say so:  --tier ${here}`)
            }
            if (here) log(`replacing "${targetId}" on the ${here.toUpperCase()} tier`)
        }
        if (existing && args.force) {
            if (extraProjects.length) {
                log(`"${targetId}" holds ${extraProjects.length} project(s) this file does not carry: ${extraProjects.map((p) => p.id).join(', ')}`)
                log(args.prune ? '  --prune: they will be DELETED' : '  they are kept (pass --prune to delete them)')
            }
            if (!args.noBackup) {
                const stamp = new Date().toISOString().replace(/[:.]/g, '-')
                const backupPath = path.join(dataRoot, '_backups', 'space-replace', `${targetId}-${stamp}.diiii`)
                await fsp.mkdir(path.dirname(backupPath), { recursive: true })
                await exportSpace({ dataRoot: args.dataRoot, target: targetId, out: backupPath })
                log(`before-copy: ${backupPath}`)
            }
        }

        const collisions = []
        const projectExists = db.prepare('SELECT space_id FROM projects WHERE id = ?')
        for (const pid of projectDirs) {
            const row = projectExists.get(pid)
            if (row && row.space_id !== targetId) collisions.push(`${pid} (in space ${row.space_id})`)
        }
        if (collisions.length) die(`project id collisions with other spaces: ${collisions.join(', ')} — import into a fresh data root`)

        // An upsert, never INSERT OR REPLACE: REPLACE deletes the old row first,
        // and `projects.space_id … ON DELETE CASCADE` then takes every project of
        // the space with it — including the ones this file never mentions — and
        // columns this statement does not list (slug, open_inscriptions) reset.
        const insertSpace = db.prepare(`INSERT INTO spaces (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET label = excluded.label, permanent = excluded.permanent, allow_edits = excluded.allow_edits, is_public = excluded.is_public, kind = excluded.kind, published_project_id = excluded.published_project_id, preview_image_asset_id = excluded.preview_image_asset_id, scene_version = excluded.scene_version, updated_at = excluded.updated_at, last_touched_at = excluded.last_touched_at, owner_user_id = excluded.owner_user_id`)
        const deleteSpaceOps = db.prepare('DELETE FROM space_ops WHERE space_id = ?')
        const insertSpaceOp = db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        // state / deleted_at / slug / position travel too. They did not, so a
        // trashed draft or an archived snapshot arrived on the next tier as a
        // LIVE project with a working public address (2026-09-18, WCC).
        // collection_id does not travel: shelves are not part of the file.
        const insertProject = db.prepare(`INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at, slug, position, state, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET space_id = excluded.space_id, title = excluded.title, document_version = excluded.document_version, source = excluded.source, updated_at = excluded.updated_at, last_touched_at = excluded.last_touched_at, slug = excluded.slug, position = excluded.position, state = excluded.state, deleted_at = excluded.deleted_at`)
        const deleteProject = db.prepare('DELETE FROM projects WHERE id = ?')
        const deleteProjectOps = db.prepare('DELETE FROM project_ops WHERE project_id = ?')
        const insertProjectOp = db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        const insertCommons = db.prepare('INSERT OR REPLACE INTO public_assets (asset_id, space_id, name, mime_type, size, license, shared_by, shared_by_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')

        const projectMetas = []
        for (const pid of projectDirs) {
            projectMetas.push(await readJson(path.join(staging, 'projects', pid, 'meta.json')))
        }

        db.transaction(() => {
            const now = Date.now()
            // A file made on a collaborator's install carries no owner and often
            // no real label (label === id). Replacing a space must not strip the
            // ones the target already has.
            const bundleLabel = space.label && space.label !== sourceId ? space.label : null
            const label = bundleLabel ?? existing?.label ?? space.label ?? targetId
            const owner = args.owner ?? existing?.owner_user_id ?? null
            insertSpace.run(
                targetId, label, space.permanent ?? 0, space.allow_edits ?? 1,
                space.is_public ?? 0, space.kind === 'global' ? 'normal' : (space.kind ?? 'normal'),
                space.published_project_id ?? null, space.preview_image_asset_id ?? null,
                space.scene_version ?? 0, space.created_at ?? now, now, now,
                owner
            )
            deleteSpaceOps.run(targetId)
            for (const op of spaceOps) insertSpaceOp.run(targetId, op.version, op.data, op.created_at ?? now)
            for (const p of projectMetas) {
                insertProject.run(p.id, targetId, p.title ?? 'Untitled Project', p.document_version ?? 0,
                    p.source ?? 'project', p.created_at ?? now, now, now,
                    p.slug ?? null, p.position ?? 0,
                    ['draft', 'live', 'archived'].includes(p.state) ? p.state : 'live', p.deleted_at ?? null)
                deleteProjectOps.run(p.id)
            }
            if (args.force && args.prune) {
                for (const p of extraProjects) { deleteProjectOps.run(p.id); deleteProject.run(p.id) }
            }
            for (const row of commons) {
                insertCommons.run(row.asset_id, targetId, row.name, row.mime_type ?? null, row.size ?? null,
                    row.license ?? null, row.shared_by ?? null, row.shared_by_label ?? null, row.created_at ?? now)
            }
        })()
        // project_ops inserts happen outside the meta transaction so one giant
        // op-log doesn't hold the write lock while files copy below.
        for (const pid of projectDirs) {
            const ops = await readJsonl(path.join(staging, 'projects', pid, 'ops.jsonl'))
            db.transaction(() => {
                for (const op of ops) insertProjectOp.run(pid, op.version, op.data, op.created_at ?? Date.now())
            })()
        }
        closeDb()

        const spaceDir = path.join(spacesDir, targetId)
        // Only what the file replaces is cleared. The whole directory used to be
        // removed here, which took the kept projects' documents with it. Space
        // assets and blobs are copied over what is there (blobs are
        // content-addressed; gc-space-blobs.mjs sweeps what nothing references).
        if (args.force) {
            if (args.prune) await fsp.rm(spaceDir, { recursive: true, force: true })
            else {
                await fsp.rm(path.join(spaceDir, 'scene.json'), { force: true })
                for (const pid of projectDirs) await fsp.rm(path.join(spaceDir, 'projects', pid), { recursive: true, force: true })
            }
        }
        await fsp.mkdir(path.join(spaceDir, 'assets'), { recursive: true })

        const sceneSrc = path.join(staging, 'space', 'scene.json')
        if (fs.existsSync(sceneSrc)) {
            const scene = remapSpaceUrls(await fsp.readFile(sceneSrc, 'utf8'), sourceId, targetId)
            await fsp.writeFile(path.join(spaceDir, 'scene.json'), scene)
        }
        await copyDirIfExists(path.join(staging, 'space', 'assets'), path.join(spaceDir, 'assets'))
        await copyDirIfExists(path.join(staging, 'blobs'), path.join(spaceDir, 'blobs'))
        for (const pid of projectDirs) {
            const src = path.join(staging, 'projects', pid)
            const dst = path.join(spaceDir, 'projects', pid)
            await fsp.mkdir(path.join(dst, 'assets'), { recursive: true })
            for (const file of ['document.json', 'project.json']) {
                if (fs.existsSync(path.join(src, file))) {
                    const text = remapSpaceUrls(await fsp.readFile(path.join(src, file), 'utf8'), sourceId, targetId)
                    await fsp.writeFile(path.join(dst, file), text)
                }
            }
            await copyDirIfExists(path.join(src, 'assets'), path.join(dst, 'assets'))
        }

        // The light show goes where the lighting desk keeps a space's show, written the
        // way the desk writes it: whole, to a temp file, the previous show kept beside it
        // as show.prev.json, then renamed into place. A file without a show leaves the
        // space's own show alone, as it leaves the projects it does not carry.
        const showDir = path.join(spaceDir, 'lighting')
        if (lightShowText !== null) {
            const showFile = path.join(showDir, 'show.json')
            await fsp.mkdir(showDir, { recursive: true })
            await fsp.writeFile(`${showFile}.tmp`, lightShowText)
            if (fs.existsSync(showFile)) await fsp.copyFile(showFile, path.join(showDir, 'show.prev.json'))
            await fsp.rename(`${showFile}.tmp`, showFile)
        } else if (existing && fs.existsSync(path.join(showDir, 'show.json'))) {
            log(`"${targetId}" keeps its own light show — this file carries none`)
        }

        const carried = lightShowText !== null ? `, ${describeLightShow(JSON.parse(lightShowText))}` : ''
        log(`imported "${sourceId}" as "${targetId}" into ${dataRoot} (${projectDirs.length} projects, ${spaceOps.length} space ops${carried})`)
        if (space.kind === 'global') log('note: source space was kind=global; imported as kind=normal (set globally via /admin if wanted)')
        if (space.owner_user_id && !args.owner) log(`note: original owner "${space.owner_user_id}" dropped (source-install user); pass --owner to set one`)
        log(`open: /${targetId}  ·  studio: /${targetId}/studio`)
        return targetId
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }
}

export { exportSpace, importSpace, resolvePaths, SLUG_REGEX }

// ---------------------------------------------------------------- main

// Both sides resolved: Node reports the main module by its real path, while an
// install is reached through the `current` symlink. Compared unresolved, a
// hand-typed `node ~/.di/current/scripts/space-bundle.mjs export …` did
// nothing and exited 0.
const invokedDirectly = (() => {
    try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (invokedDirectly) {
    const args = parseArgs(process.argv.slice(2))
    if (args.command === 'export') await exportSpace(args)
    // checkStale: true only from this direct-CLI door — see the comment on
    // the check itself in importSpace for why install-bundle.mjs's internal
    // calls must NOT opt into it.
    else if (args.command === 'import') await importSpace({ ...args, checkStale: true })
    else {
        console.log('Usage: node scripts/space-bundle.mjs export <spaceId> [--data-root <dir>] [--out <file>]')
        console.log('       node scripts/space-bundle.mjs import <bundle.tar.gz> [--data-root <dir>] [--as <id>] [--owner <userId>] [--force] [--force-stale] [--tier dev|prod] [--prune] [--no-backup]')
        process.exit(args.command ? 1 : 0)
    }
}
