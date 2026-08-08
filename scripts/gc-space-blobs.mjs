// Garbage-collect unreferenced blobs from per-space blob stores.
//
// A blob spaces/<space>/blobs/<sha256> is referenced while any project in
// that space holds assets/<sha256>.json (or a legacy assets/<sha256> binary),
// OR while any retained op in di.db still mentions it.
// Asset routes never delete blobs; this script is the only remover.
//
// The op-log matters: it scanned the filesystem alone until 2026-08-08, and on
// production that made 21 of its 33 candidates (145 MB) look collectable while
// project_ops still referenced them. Those ops are what a client replays to
// catch up, so deleting underneath them hands a catching-up client a 404.
// If the database cannot be read this script now REFUSES to delete rather than
// falling back to the filesystem-only answer — pass --ignore-db to override,
// knowing what that means.
//
// Usage:
//   node scripts/gc-space-blobs.mjs                 # dry run, all spaces
//   node scripts/gc-space-blobs.mjs --space main    # dry run, one space
//   node scripts/gc-space-blobs.mjs --apply         # actually delete
//   node scripts/gc-space-blobs.mjs --spaces-dir /path/to/data/spaces
//   node scripts/gc-space-blobs.mjs --db /path/to/di.db
//   node scripts/gc-space-blobs.mjs --ignore-db     # filesystem only (unsafe)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SPACES_DIR = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces')
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i

const parseArgs = (argv = []) => {
    const args = { spacesDir: DEFAULT_SPACES_DIR, space: '', apply: false, db: '', ignoreDb: false }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--apply') args.apply = true
        else if (arg === '--ignore-db') args.ignoreDb = true
        else if (arg === '--space') args.space = String(argv[++index] || '').trim()
        else if (arg === '--db') args.db = path.resolve(argv[++index] || '')
        else if (arg === '--spaces-dir') args.spacesDir = path.resolve(argv[++index] || DEFAULT_SPACES_DIR)
        else {
            console.error(`Unknown argument: ${arg}`)
            process.exit(2)
        }
    }
    // The db sits beside the spaces dir: <data root>/di.db, <data root>/spaces.
    if (!args.db) args.db = path.join(path.dirname(args.spacesDir), 'di.db')
    return args
}

// Every 64-hex run in the retained op-log, in one pass. Cheaper and less
// brittle than a LIKE per candidate hash, and it catches a hash wherever in the
// op payload it appears rather than only where we expect it.
const collectOpLogHashes = async (dbPath) => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const hashes = new Set()
    try {
        const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('project_ops','space_ops')",
        ).all().map((row) => row.name)
        for (const table of tables) {
            for (const row of db.prepare(`SELECT data FROM "${table}"`).all()) {
                const text = typeof row.data === 'string' ? row.data : String(row.data ?? '')
                for (const match of text.matchAll(/[a-f0-9]{64}/gi)) hashes.add(match[0].toLowerCase())
            }
        }
    } finally {
        db.close()
    }
    return hashes
}

const listDirNames = async (dir) => {
    try {
        return (await fs.readdir(dir, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
    } catch {
        return []
    }
}

const listFileNames = async (dir) => {
    try {
        return (await fs.readdir(dir, { withFileTypes: true }))
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
    } catch {
        return []
    }
}

const collectReferencedHashes = async (spaceDir) => {
    const referenced = new Set()
    for (const projectId of await listDirNames(path.join(spaceDir, 'projects'))) {
        const assetsDir = path.join(spaceDir, 'projects', projectId, 'assets')
        for (const name of await listFileNames(assetsDir)) {
            const hash = name.endsWith('.json') ? name.slice(0, -5) : name
            if (SHA256_HEX_REGEX.test(hash)) referenced.add(hash.toLowerCase())
        }
    }
    return referenced
}

const gcSpace = async (spacesDir, spaceId, apply, opLogHashes) => {
    const spaceDir = path.join(spacesDir, spaceId)
    const blobsDir = path.join(spaceDir, 'blobs')
    const blobs = (await listFileNames(blobsDir)).filter((name) => SHA256_HEX_REGEX.test(name))
    if (!blobs.length) return { spaceId, blobs: 0, removed: 0, freedBytes: 0, heldByOps: 0 }

    const referenced = await collectReferencedHashes(spaceDir)
    let removed = 0
    let freedBytes = 0
    let heldByOps = 0
    for (const blob of blobs) {
        if (referenced.has(blob.toLowerCase())) continue
        if (opLogHashes.has(blob.toLowerCase())) {
            heldByOps += 1
            console.log(`held by op-log ${spaceId}/blobs/${blob}`)
            continue
        }
        const blobPath = path.join(blobsDir, blob)
        const size = (await fs.stat(blobPath).catch(() => null))?.size || 0
        if (apply) await fs.rm(blobPath, { force: true })
        console.log(`${apply ? 'removed' : 'would remove'} ${spaceId}/blobs/${blob} (${size} bytes)`)
        removed += 1
        freedBytes += size
    }
    return { spaceId, blobs: blobs.length, removed, freedBytes, heldByOps }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const spaceIds = args.space ? [args.space] : await listDirNames(args.spacesDir)
    if (!spaceIds.length) {
        console.log(`No spaces found under ${args.spacesDir}`)
        return
    }
    let opLogHashes = new Set()
    if (args.ignoreDb) {
        console.warn('--ignore-db: the op-log is NOT being consulted. Blobs a catching-up client still needs may be deleted.')
    } else {
        try {
            opLogHashes = await collectOpLogHashes(args.db)
            console.log(`op-log: ${opLogHashes.size} hash(es) referenced in ${args.db}`)
        } catch (error) {
            console.error(`Cannot read the op-log at ${args.db}: ${error.message}`)
            console.error('Refusing to delete on a filesystem-only answer. Pass --db, or --ignore-db to override.')
            process.exit(1)
        }
    }

    let totalRemoved = 0
    let totalFreed = 0
    let totalHeld = 0
    for (const spaceId of spaceIds) {
        const result = await gcSpace(args.spacesDir, spaceId, args.apply, opLogHashes)
        totalRemoved += result.removed
        totalFreed += result.freedBytes
        totalHeld += result.heldByOps
    }
    if (totalHeld) console.log(`${totalHeld} blob(s) unreferenced on disk but held by the op-log — left in place.`)
    console.log(`${args.apply ? 'Removed' : 'Would remove'} ${totalRemoved} blob(s), ${totalFreed} bytes${args.apply ? '' : ' (dry run — pass --apply to delete)'}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
