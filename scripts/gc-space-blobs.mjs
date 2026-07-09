// Garbage-collect unreferenced blobs from per-space blob stores.
//
// A blob spaces/<space>/blobs/<sha256> is referenced while any project in
// that space holds assets/<sha256>.json (or a legacy assets/<sha256> binary).
// Asset routes never delete blobs; this script is the only remover.
//
// Usage:
//   node scripts/gc-space-blobs.mjs                 # dry run, all spaces
//   node scripts/gc-space-blobs.mjs --space main    # dry run, one space
//   node scripts/gc-space-blobs.mjs --apply         # actually delete
//   node scripts/gc-space-blobs.mjs --spaces-dir /path/to/data/spaces

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SPACES_DIR = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces')
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i

const parseArgs = (argv = []) => {
    const args = { spacesDir: DEFAULT_SPACES_DIR, space: '', apply: false }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--apply') args.apply = true
        else if (arg === '--space') args.space = String(argv[++index] || '').trim()
        else if (arg === '--spaces-dir') args.spacesDir = path.resolve(argv[++index] || DEFAULT_SPACES_DIR)
        else {
            console.error(`Unknown argument: ${arg}`)
            process.exit(2)
        }
    }
    return args
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

const gcSpace = async (spacesDir, spaceId, apply) => {
    const spaceDir = path.join(spacesDir, spaceId)
    const blobsDir = path.join(spaceDir, 'blobs')
    const blobs = (await listFileNames(blobsDir)).filter((name) => SHA256_HEX_REGEX.test(name))
    if (!blobs.length) return { spaceId, blobs: 0, removed: 0, freedBytes: 0 }

    const referenced = await collectReferencedHashes(spaceDir)
    let removed = 0
    let freedBytes = 0
    for (const blob of blobs) {
        if (referenced.has(blob.toLowerCase())) continue
        const blobPath = path.join(blobsDir, blob)
        const size = (await fs.stat(blobPath).catch(() => null))?.size || 0
        if (apply) await fs.rm(blobPath, { force: true })
        console.log(`${apply ? 'removed' : 'would remove'} ${spaceId}/blobs/${blob} (${size} bytes)`)
        removed += 1
        freedBytes += size
    }
    return { spaceId, blobs: blobs.length, removed, freedBytes }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const spaceIds = args.space ? [args.space] : await listDirNames(args.spacesDir)
    if (!spaceIds.length) {
        console.log(`No spaces found under ${args.spacesDir}`)
        return
    }
    let totalRemoved = 0
    let totalFreed = 0
    for (const spaceId of spaceIds) {
        const result = await gcSpace(args.spacesDir, spaceId, args.apply)
        totalRemoved += result.removed
        totalFreed += result.freedBytes
    }
    console.log(`${args.apply ? 'Removed' : 'Would remove'} ${totalRemoved} blob(s), ${totalFreed} bytes${args.apply ? '' : ' (dry run — pass --apply to delete)'}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
