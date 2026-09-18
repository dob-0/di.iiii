/**
 * project-move.mjs — move one project from its space to another, in place.
 *
 * There was no way to reorganise a project into a different space once
 * created: a space holds its projects by `projects.space_id`, and nothing
 * ever changed that column. The owner wants to fold several one-page spaces
 * into one — this is the move.
 *
 * A project id is global (unique across the whole install — see the
 * collision check space-bundle.mjs's importSpace makes on import), so unlike
 * space-bundle a move never touches the id: the row is updated in place, in
 * the SAME database, so project_ops (keyed only by project_id, no space_id
 * column) needs no copying at all. What actually moves:
 *   - the `projects` row: space_id changes; collection_id is cleared (a
 *     shelf belongs to one space — collectionStore.js — so a shelf reference
 *     into the OLD space would dangle); position goes to the end of the
 *     target space's own order. id, slug, state and deleted_at travel as-is.
 *   - the project's directory, `<space>/projects/<id>/` (document.json,
 *     assets/, …), moved whole.
 *
 * ASSETS — two things are not as simple as "the project's files move with
 * it", both found by reading how projectRoutes.js actually stores an asset:
 *
 *   1. Content-addressed project assets (a sha256 id) store their BYTES in
 *      the SPACE's blob store (blobStore.js, `storeBlobFromFile`) — the
 *      project directory keeps only a `<hash>.json` reference, no binary.
 *      Move the directory alone and the reference survives but the bytes
 *      stay behind in the old space; every such image would 404 the moment
 *      the project resolves against its new space_id (see the blob lookup
 *      in projectRoutes.js `GET /api/projects/:projectId/assets/:assetId`).
 *      Fixed by copying the referenced blob into the target space's store.
 *   2. A project can reference the SPACE's own shared assets directly by
 *      URL (`/api/spaces/<spaceId>/assets/<id>` — spaceRoutes.js, the same
 *      shape space-bundle.mjs's `remapSpaceUrls` rewrites on a space
 *      import/rename). Those files live in the space, not the project, and
 *      are never deleted from the source space — only copied forward, and
 *      the URL rewritten in document.json/project.json the same way
 *      `remapSpaceUrls` does it for a whole-space move.
 *
 * PUBLISHED PROJECTS — if the source space's `published_project_id` is the
 * project being moved, moving it would silently change what that space's
 * front door shows a visitor. Refused unless `--unpublish`.
 *
 * OLD LINKS — a project id is global, so `/api/projects/:id` and the
 * `/{space}/p/{id}` public form keep resolving after a move with no change
 * (PublicProjectViewer fetches by project id alone, never checks the URL's
 * space segment — src/project/components/PublicProjectViewer.jsx). Only the
 * bare vanity form `/{space}/{slugOrId}` breaks: its resolver
 * (`/api/resolve/:spaceSegment/:projectSegment`, serverXR/src/index.js)
 * explicitly refuses a project that no longer lives in that space. This tool
 * writes one row to `project_moves` per move; that resolver now consults it
 * and answers with `{ movedTo }` instead of a bare 404 — see
 * CONTRIBUTING.md ("Moving one project into a different space") for the rest.
 *
 * Usage:
 *   node scripts/project-move.mjs <projectId> --to <spaceId> [options]
 *
 * Options:
 *   --data-root <dir>   serverXR data root (default: $DATA_ROOT or serverXR/data)
 *   --dry-run            Report what would happen; write nothing
 *   --unpublish          Required if the source space currently shows this
 *                         project to visitors (published_project_id) — clears
 *                         it as part of the move
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Dynamic-friendly requires below (createRequire), not a static import of
// node:sqlite — same reason space-bundle.mjs avoids it: Vite's test
// transform tries to bundle a static `import … from 'node:sqlite'` and fails
// to even load this module the moment a test imports it.

const require = createRequire(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Same two layouts space-bundle.mjs handles — see its own comment on
// SERVER_SRC for the full story (serverXR/Dockerfile image vs. a checkout).
const SERVER_SRC = ['serverXR/src', 'src']
    .map((dir) => path.join(ROOT_DIR, dir))
    .find((dir) => fs.existsSync(path.join(dir, 'db.js')))
    || path.join(ROOT_DIR, 'serverXR', 'src')

const die = (msg) => { console.error(`[project-move] ERROR: ${msg}`); process.exit(1) }
const log = (msg) => console.log(`[project-move] ${msg}`)

const parseArgs = (argv) => {
    const args = { target: null, to: null, dataRoot: null, dryRun: false, unpublish: false }
    const positional = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--to') args.to = argv[++i]
        else if (a === '--data-root') args.dataRoot = argv[++i]
        else if (a === '--dry-run') args.dryRun = true
        else if (a === '--unpublish') args.unpublish = true
        else if (a.startsWith('--')) die(`unknown option ${a}`)
        else positional.push(a)
    }
    args.target = positional[0] || null
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

// Same shapes assetHash.js validates uploads against — an id embedded in a
// URL or a project asset's meta filename is one of these two kinds.
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i
const ASSET_ID_IN_URL_RE = /[a-f0-9-]{8,64}/i

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Space-level asset URLs embed the space id — the exact pattern
// space-bundle.mjs's remapSpaceUrls rewrites on a whole-space import/rename.
const remapSpaceUrls = (text, oldId, newId) =>
    oldId === newId ? text : text.split(`/api/spaces/${oldId}/`).join(`/api/spaces/${newId}/`)

const moveDir = async (from, to) => {
    try {
        await fsp.rename(from, to)
    } catch (error) {
        if (error.code !== 'EXDEV') throw error
        await fsp.cp(from, to, { recursive: true })
        await fsp.rm(from, { recursive: true, force: true })
    }
}

const copyIfMissing = async (from, to) => {
    if (!fs.existsSync(from) || fs.existsSync(to)) return false
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.copyFile(from, to)
    return true
}

async function moveProject(args) {
    const { dataRoot, spacesDir, dbPath } = resolvePaths(args.dataRoot)
    const projectId = args.target
    const toSpaceId = args.to
    if (!projectId) die('project-move needs a project id')
    if (!toSpaceId) die('--to <spaceId> is required')
    if (!fs.existsSync(dbPath)) die(`no database at ${dbPath} — wrong --data-root?`)

    const { initDb, closeDb } = require(path.join(SERVER_SRC, 'db.js'))
    const db = initDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    if (!project) die(`project "${projectId}" not found in ${dbPath}`)
    const fromSpaceId = project.space_id

    const targetSpace = db.prepare('SELECT * FROM spaces WHERE id = ?').get(toSpaceId)
    if (!targetSpace) die(`target space "${toSpaceId}" not found in ${dbPath}`)

    if (fromSpaceId === toSpaceId) die(`project "${projectId}" is already in space "${toSpaceId}"`)

    const sourceSpace = db.prepare('SELECT * FROM spaces WHERE id = ?').get(fromSpaceId)
    if (!sourceSpace) die(`project "${projectId}" points at space "${fromSpaceId}", which does not exist — fix the data before moving it`)

    const isPublished = sourceSpace.published_project_id === projectId
    if (isPublished && !args.unpublish) {
        die(`space "${fromSpaceId}" currently shows this project to visitors (published_project_id) — `
            + `moving it would silently change what the space's front door shows.\n`
            + `  pass --unpublish to move it anyway and clear the source space's published project`)
    }

    // A project slug is only unique WITHIN a space (idx_projects_slug is on
    // (space_id, slug)) — carrying the old slug into a target that already
    // has one would fail the unique index. Drop it rather than refuse the
    // whole move; the id-based /p/ link and the project_moves pointer both
    // still work without it.
    const originalSlug = project.slug || null
    let slugDropped = false
    if (originalSlug) {
        const collision = db.prepare('SELECT id FROM projects WHERE space_id = ? AND slug = ? AND id != ?').get(toSpaceId, originalSlug, projectId)
        if (collision) slugDropped = true
    }

    const maxPos = db.prepare('SELECT MAX(position) AS top FROM projects WHERE space_id = ?').get(toSpaceId)
    const newPosition = (maxPos?.top ?? -1) + 1

    const sourceSpaceDir = path.join(spacesDir, fromSpaceId)
    const targetSpaceDir = path.join(spacesDir, toSpaceId)
    const sourceProjectDir = path.join(sourceSpaceDir, 'projects', projectId)
    const targetProjectDir = path.join(targetSpaceDir, 'projects', projectId)
    if (fs.existsSync(targetProjectDir)) die(`target already has a directory at ${targetProjectDir} — refusing to overwrite`)

    // ---- gather asset work up front so --dry-run can report it truthfully ----

    // 1. project-owned assets whose bytes live in the SOURCE space's blob
    // store (a `<hash>.json` reference with no sibling binary in the
    // project's own assets dir — see projectRoutes.js POST .../assets).
    const blobAssetIds = []
    const projectAssetsDir = path.join(sourceProjectDir, 'assets')
    if (fs.existsSync(projectAssetsDir)) {
        for (const name of fs.readdirSync(projectAssetsDir)) {
            if (!name.endsWith('.json')) continue
            const assetId = name.slice(0, -'.json'.length)
            if (!SHA256_HEX_REGEX.test(assetId)) continue
            if (fs.existsSync(path.join(projectAssetsDir, assetId))) continue // legacy local binary — moves with the dir
            blobAssetIds.push(assetId)
        }
    }

    // 2. space-scoped assets the project's own documents reference by URL.
    const docFiles = ['document.json', 'project.json']
        .map((name) => path.join(sourceProjectDir, name))
        .filter((file) => fs.existsSync(file))
    const docTexts = new Map()
    const spaceAssetIds = new Set()
    let needsUrlRewrite = false
    for (const file of docFiles) {
        const text = fs.readFileSync(file, 'utf8')
        docTexts.set(file, text)
        if (!text.includes(`/api/spaces/${fromSpaceId}/`)) continue
        needsUrlRewrite = true
        const re = new RegExp(`/api/spaces/${escapeRegExp(fromSpaceId)}/assets/(${ASSET_ID_IN_URL_RE.source})`, 'gi')
        let m
        while ((m = re.exec(text))) spaceAssetIds.add(m[1])
    }

    if (args.dryRun) {
        log(`DRY RUN — would move project "${projectId}" from "${fromSpaceId}" to "${toSpaceId}"`)
        log(`  position: end of "${toSpaceId}"'s order (${newPosition})`)
        if (slugDropped) log(`  slug "${originalSlug}" collides with another project in "${toSpaceId}" — would be cleared`)
        if (isPublished) log(`  "${fromSpaceId}".published_project_id would be cleared (--unpublish)`)
        log(`  ${blobAssetIds.length} project-owned blob asset(s) would be copied into "${toSpaceId}"'s blob store`)
        if (needsUrlRewrite) log(`  document references space "${fromSpaceId}" assets — ${spaceAssetIds.size} would be copied and the URLs rewritten`)
        log('  nothing written (--dry-run)')
        closeDb()
        return
    }

    // ---- do it: DB row first, in one transaction ----
    // slug is cleared in the SAME statement as space_id, not a follow-up
    // UPDATE — (space_id, slug) is a unique pair, and setting space_id alone
    // first would collide against the very slug this is dropping to avoid.
    const now = Date.now()
    db.transaction(() => {
        db.prepare('UPDATE projects SET space_id = ?, slug = ?, collection_id = NULL, position = ?, updated_at = ? WHERE id = ?')
            .run(toSpaceId, slugDropped ? null : originalSlug, newPosition, now, projectId)
        if (isPublished) db.prepare('UPDATE spaces SET published_project_id = NULL, updated_at = ? WHERE id = ?').run(now, fromSpaceId)
        db.prepare('INSERT INTO project_moves (project_id, from_space, to_space, old_slug, moved_at) VALUES (?, ?, ?, ?, ?)')
            .run(projectId, fromSpaceId, toSpaceId, originalSlug, now)
    })()
    closeDb()

    // ---- then the files ----
    if (fs.existsSync(sourceProjectDir)) {
        await fsp.mkdir(path.dirname(targetProjectDir), { recursive: true })
        await moveDir(sourceProjectDir, targetProjectDir)
    } else {
        log(`warning: no project directory at ${sourceProjectDir} (DB row only — nothing to move on disk)`)
    }

    let blobsCopied = 0
    if (blobAssetIds.length) {
        await fsp.mkdir(path.join(targetSpaceDir, 'blobs'), { recursive: true })
        for (const assetId of blobAssetIds) {
            const copied = await copyIfMissing(path.join(sourceSpaceDir, 'blobs', assetId), path.join(targetSpaceDir, 'blobs', assetId))
            if (copied) blobsCopied++
        }
    }

    let spaceAssetsCopied = 0
    if (needsUrlRewrite) {
        for (const assetId of spaceAssetIds) {
            const copiedBinary = await copyIfMissing(path.join(sourceSpaceDir, 'assets', assetId), path.join(targetSpaceDir, 'assets', assetId))
            const copiedMeta = await copyIfMissing(path.join(sourceSpaceDir, 'assets', `${assetId}.json`), path.join(targetSpaceDir, 'assets', `${assetId}.json`))
            if (copiedBinary || copiedMeta) spaceAssetsCopied++
        }
        for (const file of docFiles) {
            const newPath = path.join(targetProjectDir, path.basename(file))
            if (!fs.existsSync(newPath)) continue // e.g. project dir was missing above
            const rewritten = remapSpaceUrls(docTexts.get(file), fromSpaceId, toSpaceId)
            await fsp.writeFile(newPath, rewritten)
        }
    }

    log(`moved project "${projectId}" from "${fromSpaceId}" to "${toSpaceId}" (position ${newPosition})`)
    if (slugDropped) log(`  slug "${originalSlug}" collided in "${toSpaceId}" — cleared. /${fromSpaceId}/${originalSlug} now resolves via the moved-project pointer; /${toSpaceId}/p/${projectId} is the stable link`)
    if (isPublished) log(`  cleared "${fromSpaceId}".published_project_id — it was showing this project to visitors`)
    if (blobsCopied) log(`  copied ${blobsCopied} project-owned blob asset(s) into "${toSpaceId}"'s blob store`)
    if (spaceAssetsCopied) log(`  copied ${spaceAssetsCopied} space-scoped asset(s) referenced in the document into "${toSpaceId}", and rewrote their URLs`)
    log(`  old links: /${fromSpaceId}/p/${projectId} and /api/projects/${projectId} keep working (project id is global);`)
    log(`  /${fromSpaceId}/${originalSlug || projectId} now answers via a project_moves pointer to /${toSpaceId}/p/${projectId}`)
    return { fromSpaceId, toSpaceId, dataRoot }
}

export { moveProject, resolvePaths }

// ---------------------------------------------------------------- main

const invokedDirectly = (() => {
    try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (invokedDirectly) {
    const args = parseArgs(process.argv.slice(2))
    if (!args.target || !args.to) {
        console.log('Usage: node scripts/project-move.mjs <projectId> --to <spaceId> [--data-root <dir>] [--dry-run] [--unpublish]')
        process.exit(args.target || args.to ? 1 : 0)
    } else {
        await moveProject(args)
    }
}
