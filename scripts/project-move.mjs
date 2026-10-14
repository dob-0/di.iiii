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

async function moveProject(args) {
    const { dataRoot, spacesDir, dbPath } = resolvePaths(args.dataRoot)
    if (!args.target) die('project-move needs a project id')
    if (!args.to) die('--to <spaceId> is required')
    if (!fs.existsSync(dbPath)) die(`no database at ${dbPath} — wrong --data-root?`)

    const { initDb, closeDb } = require(path.join(SERVER_SRC, 'db.js'))
    const { moveProjectBetweenSpaces, MoveRefused } = require(path.join(SERVER_SRC, 'projectMove.js'))
    const db = initDb(dbPath)
    let r
    try {
        // The logic lives in serverXR/src/projectMove.js, shared with the
        // product route. This script keeps its older choice on a slug clash:
        // drop the slug rather than refuse.
        r = await moveProjectBetweenSpaces({
            db, spacesDir, projectId: args.target, toSpaceId: args.to,
            unpublish: args.unpublish, dryRun: args.dryRun, onSlugClash: 'drop'
        })
    } catch (error) {
        closeDb()
        if (error instanceof MoveRefused) die(error.message)
        throw error
    }
    closeDb()

    if (r.dryRun) {
        log(`DRY RUN — would move project "${r.projectId}" from "${r.fromSpaceId}" to "${r.toSpaceId}"`)
        log(`  position: end of "${r.toSpaceId}"'s order (${r.position})`)
        if (r.slugDropped) log(`  slug "${r.originalSlug}" collides with another project in "${r.toSpaceId}" — would be cleared`)
        if (r.wasPublished) log(`  "${r.fromSpaceId}".published_project_id would be cleared (--unpublish)`)
        log(`  ${r.blobAssets} project-owned blob asset(s) would be copied into "${r.toSpaceId}"'s blob store`)
        if (r.urlsRewritten) log(`  document references space "${r.fromSpaceId}" assets — ${r.spaceAssets} would be copied and the URLs rewritten`)
        log('  nothing written (--dry-run)')
        return
    }
    if (!r.hadDirectory) log(`warning: no project directory for "${r.projectId}" (DB row only — nothing to move on disk)`)
    log(`moved project "${r.projectId}" from "${r.fromSpaceId}" to "${r.toSpaceId}" (position ${r.position})`)
    if (r.slugDropped) log(`  slug "${r.originalSlug}" collided in "${r.toSpaceId}" — cleared. /${r.fromSpaceId}/${r.originalSlug} now resolves via the moved-project pointer; /${r.toSpaceId}/p/${r.projectId} is the stable link`)
    if (r.wasPublished) log(`  cleared "${r.fromSpaceId}".published_project_id — it was showing this project to visitors`)
    if (r.blobsCopied) log(`  copied ${r.blobsCopied} project-owned blob asset(s) into "${r.toSpaceId}"'s blob store`)
    if (r.spaceAssetsCopied) log(`  copied ${r.spaceAssetsCopied} space-scoped asset(s) referenced in the document into "${r.toSpaceId}", and rewrote their URLs`)
    log(`  old links: /${r.fromSpaceId}/p/${r.projectId} and /api/projects/${r.projectId} keep working (project id is global);`)
    log(`  /${r.fromSpaceId}/${r.originalSlug || r.projectId} now answers via a project_moves pointer to /${r.toSpaceId}/p/${r.projectId}`)
    return { fromSpaceId: r.fromSpaceId, toSpaceId: r.toSpaceId, dataRoot }
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
