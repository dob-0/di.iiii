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
        if (key === 'skip') {
            values[key] = values[key] || []
            values[key].push(next)
        } else {
            values[key] = next
        }
        index += 1
    }
    return values
}

const values = parseArgs(process.argv.slice(2))
const destDir = path.resolve(
    process.cwd(),
    String(values.dest || process.env.PUBLIC_DI_I_DEST || '').trim()
)
const skipEntries = (values.skip || []).map((entry) => entry.trim()).filter(Boolean)

if (!destDir || destDir === ROOT_DIR) {
    throw new Error('Pass --dest <path> or set PUBLIC_DI_I_DEST to a cloned dob-0/di.i checkout.')
}

const SYNC_PREFIXES = [
    'public/',
    'src/',
    'shared/',
    'serverXR/public/',
    'serverXR/src/',
    'docs/architecture/',
    'docs/roadmaps/',
    'docs/testing/'
]

const SYNC_FILES = new Set([
    '.gitignore',
    '.github/workflows/ci.yml',
    'eslint.config.js',
    'prettier.config.cjs',
    'vite.config.js',
    'serverXR/package.json',
    'serverXR/package-lock.json'
])

const BLOCKED_PREFIXES = [
    '.deploy/',
    'deploy/',
    'docs/checkpoints/',
    'docs/deploy/',
    'docs/ops/',
    'legacy/',
    'open_call/',
    'public/serverXR/',
    'scene examples/',
    'serverXR/data/',
    'serverXR/uploads/',
    'scripts/'
]

const BLOCKED_FILES = new Set([
    'README.md',
    '.github/workflows/auto-pr.yml',
    '.github/workflows/publish-cpanel-prebuilt-v2.yml',
    '.github/workflows/release.yml',
    'docs/deck/README.md',
    'docs/deck/di.ii XR studio_network .pdf',
    'public/.htaccess',
    'public/clear-default-scene.php',
    'public/upload-default-scene.php',
    'serverXR/README.md'
])

const toPosix = (value) => value.split(path.sep).join('/')

const matchesPrefix = (filePath, prefixes) => prefixes.some((prefix) => filePath.startsWith(prefix))

const matchesSkip = (filePath) =>
    skipEntries.some((entry) => filePath === entry || filePath.startsWith(`${entry}/`))

const isPublicSyncPath = (filePath) => {
    if (BLOCKED_FILES.has(filePath)) return false
    if (matchesPrefix(filePath, BLOCKED_PREFIXES)) return false
    if (matchesSkip(filePath)) return false
    if (SYNC_FILES.has(filePath)) return true
    return matchesPrefix(filePath, SYNC_PREFIXES)
}

const ensureParent = async (targetPath) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
}

const writeJson = async (targetPath, value) => {
    await ensureParent(targetPath)
    await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`)
}

const listLocalFiles = async (startPath) => {
    const rootPath = path.join(ROOT_DIR, startPath)
    const entries = await fs.readdir(rootPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const fullPath = path.join(rootPath, entry.name)
        const relPath = toPosix(path.relative(ROOT_DIR, fullPath))
        if (entry.isDirectory()) {
            files.push(...await listLocalFiles(relPath))
            continue
        }
        files.push(relPath)
    }

    return files
}

const buildPublicPackage = (privatePackage) => ({
    name: 'di-i',
    version: privatePackage.version,
    private: false,
    type: privatePackage.type,
    description: 'Public di.i app and runtime for open-source collaboration.',
    engines: privatePackage.engines,
    scripts: {
        dev: 'vite',
        'dev:server': 'npm --prefix serverXR run dev',
        build: 'vite build',
        preview: 'vite preview',
        lint: 'eslint src --ext .js,.jsx',
        test: 'vitest run',
        'test:server-contracts': 'vitest run serverXR/src/httpContracts.test.js serverXR/src/projectContracts.test.js',
        format: 'prettier --write .'
    },
    dependencies: privatePackage.dependencies,
    devDependencies: privatePackage.devDependencies
})

const buildPublicLockfile = (privateLock) => {
    const lockfile = structuredClone(privateLock)
    lockfile.name = 'di-i'
    if (lockfile.packages?.['']) {
        lockfile.packages[''].name = 'di-i'
        lockfile.packages[''].private = false
    }
    return lockfile
}

const main = async () => {
    const collectedFiles = new Set()

    for (const prefix of SYNC_PREFIXES) {
        const normalizedPrefix = prefix.replace(/\/+$/, '')
        const fullPath = path.join(ROOT_DIR, normalizedPrefix)
        try {
            const stats = await fs.stat(fullPath)
            if (!stats.isDirectory()) continue
            const files = await listLocalFiles(normalizedPrefix)
            files.forEach((filePath) => collectedFiles.add(filePath))
        } catch {
            // Ignore missing directories in partial checkouts.
        }
    }

    for (const filePath of SYNC_FILES) {
        try {
            const stats = await fs.stat(path.join(ROOT_DIR, filePath))
            if (stats.isFile()) collectedFiles.add(filePath)
        } catch {
            // Ignore optional files.
        }
    }

    const syncFiles = Array.from(collectedFiles).filter(isPublicSyncPath).sort()
    const copied = []

    for (const filePath of syncFiles) {
        const buffer = await fs.readFile(path.join(ROOT_DIR, filePath))
        const targetPath = path.join(destDir, filePath)
        await ensureParent(targetPath)
        await fs.writeFile(targetPath, buffer)
        copied.push(filePath)
    }

    const privatePackage = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'))
    const privateLock = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'package-lock.json'), 'utf8'))

    await writeJson(path.join(destDir, 'package.json'), buildPublicPackage(privatePackage))
    await writeJson(path.join(destDir, 'package-lock.json'), buildPublicLockfile(privateLock))

    // Copy public-README.md → README.md in destination
    const publicReadmeSrc = path.join(ROOT_DIR, 'public-README.md')
    try {
        const readmeBuffer = await fs.readFile(publicReadmeSrc)
        await fs.writeFile(path.join(destDir, 'README.md'), readmeBuffer)
        copied.push('public-README.md -> README.md')
    } catch {
        // Ignore if not present.
    }

    const summary = {
        source: 'worktree',
        destDir: toPosix(destDir),
        syncedCount: copied.length,
        skipped: skipEntries,
        generatedFiles: ['package.json', 'package-lock.json', 'README.md']
    }

    console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
