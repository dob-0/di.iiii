import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const parseArgs = (argv) => {
    const values = {}
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index]
        if (!entry.startsWith('--')) continue
        const key = entry.slice(2)
        const next = argv[index + 1]
        if (!next || next.startsWith('--')) {
            values[key] = true
            continue
        }
        values[key] = next
        index += 1
    }
    return values
}

const values = parseArgs(process.argv.slice(2))
const destDir = path.resolve(
    process.cwd(),
    String(values.dest || process.env.PUBLIC_BR_ID_GE_DEST || '').trim()
)

if (!destDir || destDir === ROOT_DIR) {
    throw new Error('Pass --dest <path> or set PUBLIC_BR_ID_GE_DEST to a cloned dob-0/br_id_ge checkout.')
}

// README.md is intentionally excluded — br_id_ge maintains its own README.
// Syncing di.iiii's README would overwrite br_id_ge's project-specific content.
const SYNC_FILES = [
    'DEVELOPMENT.md',
    'index.html',
    'docs/PROJECT.md',
    '.nojekyll'
]

const ensureParent = async (targetPath) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
}

const copied = []

for (const filePath of SYNC_FILES) {
    const sourcePath = path.join(ROOT_DIR, filePath)
    const targetPath = path.join(destDir, filePath)
    try {
        const stats = await fs.stat(sourcePath)
        if (!stats.isFile()) continue
        await ensureParent(targetPath)
        await fs.copyFile(sourcePath, targetPath)
        copied.push(filePath)
    } catch {
        // Ignore missing files in partial checkouts.
    }
}

console.log(JSON.stringify({
    source: 'di.iiii',
    destDir,
    syncedCount: copied.length,
    syncedFiles: copied
}, null, 2))
