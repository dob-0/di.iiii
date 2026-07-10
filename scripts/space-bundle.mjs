/**
 * space-bundle.mjs — export a space to a portable bundle, or import one.
 *
 * A bundle is a tar.gz holding everything a space is made of — DB rows
 * (spaces, space_ops, projects, project_ops, public_assets), scene.json,
 * space-level assets, per-project documents + asset refs, and the CAS blob
 * store — so a space can be moved to another install (or archived) without
 * a running source server. Sync keys and GitHub links are stripped: they
 * carry secrets and host-specific bindings.
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
 */

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const require = createRequire(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BUNDLE_FORMAT = 'di.space-bundle'
const BUNDLE_VERSION = 1
const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const STRIPPED_TABLES = ['space_sync_keys', 'space_links']

const die = (msg) => { console.error(`[space-bundle] ERROR: ${msg}`); process.exit(1) }
const log = (msg) => console.log(`[space-bundle] ${msg}`)

const parseArgs = (argv) => {
    const args = { command: null, target: null, dataRoot: null, out: null, as: null, owner: null, force: false }
    const positional = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--data-root') args.dataRoot = argv[++i]
        else if (a === '--out') args.out = argv[++i]
        else if (a === '--as') args.as = argv[++i]
        else if (a === '--owner') args.owner = argv[++i]
        else if (a === '--force') args.force = true
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

// ---------------------------------------------------------------- export

async function exportSpace(args) {
    const { spacesDir, dbPath } = resolvePaths(args.dataRoot)
    const spaceId = args.target
    if (!spaceId || !SLUG_REGEX.test(spaceId)) die(`export needs a valid space id, got "${spaceId}"`)
    if (!fs.existsSync(dbPath)) die(`no database at ${dbPath} — wrong --data-root?`)

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

        const manifest = {
            format: BUNDLE_FORMAT,
            version: BUNDLE_VERSION,
            spaceId,
            exportedAt: new Date().toISOString(),
            counts: {
                spaceOps: spaceOps.length,
                projects: projects.length,
                commonsAssets: commons.length
            },
            stripped: STRIPPED_TABLES
        }
        await fsp.writeFile(path.join(staging, 'bundle.json'), JSON.stringify(manifest, null, 2))

        const out = path.resolve(args.out || `${spaceId}.space-bundle.tar.gz`)
        execFileSync('tar', ['-czf', out, '-C', staging, '.'])
        const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
        log(`exported space "${spaceId}" → ${out} (${size} MB, ${projects.length} projects, ${spaceOps.length} space ops)`)
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
        if (manifest.version > BUNDLE_VERSION) die(`bundle version ${manifest.version} is newer than this tool (${BUNDLE_VERSION})`)

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
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(dbPath)

        const existing = db.prepare('SELECT 1 FROM spaces WHERE id = ?').get(targetId)
        if (existing && !args.force) die(`space "${targetId}" already exists — use --force to overwrite or --as <newId>`)

        const collisions = []
        const projectExists = db.prepare('SELECT space_id FROM projects WHERE id = ?')
        for (const pid of projectDirs) {
            const row = projectExists.get(pid)
            if (row && row.space_id !== targetId) collisions.push(`${pid} (in space ${row.space_id})`)
        }
        if (collisions.length) die(`project id collisions with other spaces: ${collisions.join(', ')} — import into a fresh data root`)

        const insertSpace = db.prepare('INSERT OR REPLACE INTO spaces (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        const deleteSpaceOps = db.prepare('DELETE FROM space_ops WHERE space_id = ?')
        const insertSpaceOp = db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        const insertProject = db.prepare('INSERT OR REPLACE INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        const deleteProjectOps = db.prepare('DELETE FROM project_ops WHERE project_id = ?')
        const insertProjectOp = db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        const insertCommons = db.prepare('INSERT OR REPLACE INTO public_assets (asset_id, space_id, name, mime_type, size, license, shared_by, shared_by_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')

        const projectMetas = []
        for (const pid of projectDirs) {
            projectMetas.push(await readJson(path.join(staging, 'projects', pid, 'meta.json')))
        }

        db.transaction(() => {
            const now = Date.now()
            insertSpace.run(
                targetId, space.label ?? targetId, space.permanent ?? 0, space.allow_edits ?? 1,
                space.is_public ?? 0, space.kind === 'global' ? 'normal' : (space.kind ?? 'normal'),
                space.published_project_id ?? null, space.preview_image_asset_id ?? null,
                space.scene_version ?? 0, space.created_at ?? now, now, now,
                args.owner ?? null
            )
            deleteSpaceOps.run(targetId)
            for (const op of spaceOps) insertSpaceOp.run(targetId, op.version, op.data, op.created_at ?? now)
            for (const p of projectMetas) {
                insertProject.run(p.id, targetId, p.title ?? 'Untitled Project', p.document_version ?? 0,
                    p.source ?? 'project', p.created_at ?? now, now, now)
                deleteProjectOps.run(p.id)
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
        if (args.force) await fsp.rm(spaceDir, { recursive: true, force: true })
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

        log(`imported "${sourceId}" as "${targetId}" into ${dataRoot} (${projectDirs.length} projects, ${spaceOps.length} space ops)`)
        if (space.kind === 'global') log('note: source space was kind=global; imported as kind=normal (set globally via /admin if wanted)')
        if (space.owner_user_id && !args.owner) log(`note: original owner "${space.owner_user_id}" dropped (source-install user); pass --owner to set one`)
        log(`open: /${targetId}  ·  studio: /${targetId}/studio`)
        return targetId
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2))
if (args.command === 'export') await exportSpace(args)
else if (args.command === 'import') await importSpace(args)
else {
    console.log('Usage: node scripts/space-bundle.mjs export <spaceId> [--data-root <dir>] [--out <file>]')
    console.log('       node scripts/space-bundle.mjs import <bundle.tar.gz> [--data-root <dir>] [--as <id>] [--owner <userId>] [--force]')
    process.exit(args.command ? 1 : 0)
}
