/**
 * pack-runtime.mjs — build the artifact a local `di` install actually runs.
 *
 *   npm run di:pack                 # → dist-runtime/di-runtime-<version>.tar.gz
 *   npm run di:pack -- --no-build   # reuse an existing dist/
 *
 * What goes in, and why it is not just "the repo":
 *   dist/        the built app. Already built here, so the artist never runs Vite
 *   serverXR/    src, public, package.json, package-lock.json — `npm ci --omit=dev`
 *                on the far side installs a small, prebuilt dependency set
 *   shared/      the schema contracts serverXR loads at runtime
 *   scripts/di/  the CLI itself, so `di update` replaces the CLI too
 *   scripts/     space-bundle.mjs + install-bundle.mjs, which back up and restore
 *
 * What stays out: the root dependency tree (~1 GB with three.js, MUI, pdfjs and
 * playwright), every test, every doc, .git. An artist installs a product.
 */

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'dist-runtime')

const args = process.argv.slice(2)
const skipBuild = args.includes('--no-build')

const log = (message) => process.stdout.write(`[pack] ${message}\n`)
const die = (message) => { process.stderr.write(`[pack] ERROR: ${message}\n`); process.exit(1) }

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', ...options })
    if (result.status !== 0) die(`${command} ${commandArgs.join(' ')} failed (exit ${result.status})`)
}

const readVersion = async () => {
    const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'))
    const fromArg = args.find(arg => arg.startsWith('--version='))
    return (fromArg ? fromArg.split('=')[1] : null) || pkg.version || '0.0.0'
}

const copy = async (from, to) => {
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.cp(from, to, { recursive: true })
}

const main = async () => {
    const version = await readVersion()
    const stageName = `di-runtime-${version}`
    const stage = path.join(OUT_DIR, stageName)
    const archive = path.join(OUT_DIR, `${stageName}.tar.gz`)

    if (!skipBuild) {
        log('building the app…')
        run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { shell: process.platform === 'win32' })
    }
    if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
        die('dist/index.html is missing — build first, or drop --no-build')
    }

    await fsp.rm(stage, { recursive: true, force: true })
    await fsp.mkdir(stage, { recursive: true })

    log('assembling…')
    await copy(path.join(ROOT, 'dist'), path.join(stage, 'dist'))
    await copy(path.join(ROOT, 'shared'), path.join(stage, 'shared'))
    await copy(path.join(ROOT, 'serverXR', 'src'), path.join(stage, 'serverXR', 'src'))
    await copy(path.join(ROOT, 'serverXR', 'public'), path.join(stage, 'serverXR', 'public'))
    await copy(path.join(ROOT, 'serverXR', 'package.json'), path.join(stage, 'serverXR', 'package.json'))
    await copy(path.join(ROOT, 'serverXR', 'package-lock.json'), path.join(stage, 'serverXR', 'package-lock.json'))
    await copy(path.join(ROOT, 'scripts', 'di'), path.join(stage, 'cli'))
    for (const script of ['space-bundle.mjs', 'install-bundle.mjs']) {
        await copy(path.join(ROOT, 'scripts', script), path.join(stage, 'scripts', script))
    }
    if (fs.existsSync(path.join(ROOT, 'docker-compose.di.yml'))) {
        await copy(path.join(ROOT, 'docker-compose.di.yml'), path.join(stage, 'docker-compose.di.yml'))
    }

    // ── the algoVrithm media problem ──
    // src/algoVrithm/assets holds 197 MB of stock video, imported as ES modules,
    // so every build bundles all of it into dist/assets — 220 MB of a 232 MB
    // dist. Asking a stranger to download that to open an empty space is not a
    // first impression worth having, and the artifact is not the place to fix
    // it: the fix is lazy-loading those imports in the app.
    // So they are dropped by default and the cost is stated out loud, never
    // silently. --with-media ships the complete build.
    if (!args.includes('--with-media')) {
        const assetsDir = path.join(stage, 'dist', 'assets')
        let dropped = 0
        let bytes = 0
        for (const entry of await fsp.readdir(assetsDir, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.mp4')) continue
            const full = path.join(assetsDir, entry.name)
            bytes += (await fsp.stat(full)).size
            await fsp.rm(full, { force: true })
            dropped += 1
        }
        if (dropped) {
            log(`dropped ${dropped} bundled videos (${(bytes / 1024 / 1024).toFixed(0)} MB) — the algovrithm lane's stock footage`)
            log('  that surface will show missing media in this build. --with-media ships them.')
            await fsp.writeFile(path.join(stage, 'MISSING_MEDIA.txt'),
                `${dropped} .mp4 files from src/algoVrithm/assets were left out of this build to keep the download small.\n`
                + 'Everything else is complete. The algovrithm surface will show missing media.\n'
                + 'Build with --with-media to include them.\n')
        }
    }

    // Tests ship in the same directories as the code they cover — they are not
    // part of a product an artist installs.
    const dropTests = async (dir) => {
        for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) await dropTests(full)
            else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) await fsp.rm(full, { force: true })
        }
    }
    await dropTests(stage)

    await fsp.writeFile(path.join(stage, 'release.json'), `${JSON.stringify({
        version,
        packedAt: new Date().toISOString(),
        node: process.version
    }, null, 2)}\n`)

    log('archiving…')
    run('tar', ['-czf', archive, '-C', OUT_DIR, stageName])
    await fsp.rm(stage, { recursive: true, force: true })

    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk)
    const digest = hash.digest('hex')
    await fsp.writeFile(path.join(OUT_DIR, 'checksums.txt'), `${digest}  ${path.basename(archive)}\n`)

    const { size } = await fsp.stat(archive)
    log(`${path.relative(ROOT, archive)} — ${(size / 1024 / 1024).toFixed(1)} MB`)
    log(`sha256 ${digest}`)
}

main().catch((error) => die(String(error?.stack || error)))
