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
 *
 * The build runs under DI_PROFILE=local, which leaves out di-studio.xyz's
 * hosting furniture — the install scripts, the OpenGraph images, the cPanel
 * php shims — and keeps the studio's own pieces, because an install that
 * cannot open the owner's own exhibition offline is not an offline install.
 *
 *   npm run di:pack                 # local: the program and the works
 *   npm run di:pack -- --slim       # the program alone — 15 MB instead of 128
 *   npm run di:pack -- --full       # the hosted shape, furniture and all
 *
 * See the local profile in vite.config.js for how the slim cut works, and why
 * it cuts at the graph rather than deleting files after the fact.
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
const full = args.includes('--full')
const slim = args.includes('--slim')
// The name the BUILD will write into dist/build-profile.json — checked against
// it below rather than trusted, so `--no-build` cannot mislabel a stale dist/.
const profile = full ? 'hosted' : (slim ? 'local-slim' : 'local')

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

const copy = async (from, to, filter = null) => {
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.cp(from, to, { recursive: true, ...(filter ? { filter } : {}) })
}

const main = async () => {
    if (full && slim) die('--full and --slim ask for opposite artifacts. Pick one.')
    const version = await readVersion()
    const stageName = `di-runtime-${version}`
    const stage = path.join(OUT_DIR, stageName)
    const archive = path.join(OUT_DIR, `${stageName}.tar.gz`)

    if (!skipBuild) {
        log(`building the app (${profile} profile)…`)
        run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
            shell: process.platform === 'win32',
            // DI_VERSION so the app announces the version it is actually
            // packed as — the landing's identity card reads it at build time,
            // and package.json is not the released number.
            env: {
                ...process.env,
                DI_PROFILE: full ? '' : 'local',
                DI_LOCAL_SLIM: slim ? '1' : '',
                DI_VERSION: version
            }
        })
    }
    if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
        die('dist/index.html is missing — build first, or drop --no-build')
    }
    // --no-build reuses whatever dist/ happens to be there, and all three
    // profiles produce the same filenames. `npm run dev` or a deploy build
    // leaves the hosted shape behind, so without this check `--no-build` would
    // quietly pack di-studio.xyz's hosting furniture into an artist's install
    // and report the local profile in release.json.
    //
    // Sniffing for dist/wcc used to answer this. It cannot any more: a local
    // build has dist/wcc too, on purpose. The build writes down which shape it
    // made (vite.config.js, emitBuildProfilePlugin) and this reads it.
    const markerPath = path.join(ROOT, 'dist', 'build-profile.json')
    if (!fs.existsSync(markerPath)) {
        die('dist/build-profile.json is missing — this dist/ predates the profile marker.\n'
            + '  rebuild:  npm run di:pack           (drop --no-build)')
    }
    const marker = JSON.parse(await fsp.readFile(markerPath, 'utf8'))
    if (marker.profile !== profile) {
        die(`dist/ was built as the ${marker.profile} profile, but this pack is the ${profile} one.\n`
            + '  rebuild:  drop --no-build, or pack the shape you have on purpose\n'
            + '    local (program + works):  npm run di:pack\n'
            + '    program alone:            npm run di:pack -- --slim\n'
            + '    hosted:                   npm run di:pack -- --full')
    }
    // Published pages rewritten by scripts/page-vendor-cdn.mjs fetch their
    // libraries from /vendor/; a dist/ built before public/vendor/ existed
    // would install a server that 404s them, and those pages go black online
    // as well as offline (that was the owner's install on 2026-09-07).
    if (!fs.existsSync(path.join(ROOT, 'dist', 'vendor', 'VENDOR.md'))) {
        die('dist/ has no vendor/ — it predates public/vendor/ or was built from a tree without it.\n'
            + '  rebuild:  DI_PROFILE=local npm run build')
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
    // The SDK travels with the install, or `di mcp` is a command that only
    // works in a checkout — which would make "an agent can drive your own
    // di.iiii" true for developers and false for everyone the installer is
    // actually for. Tests stay behind; nothing at runtime imports them.
    await copy(path.join(ROOT, 'sdk'), path.join(stage, 'sdk'), (src) => !/\.(test|spec)\.(js|mjs)$/.test(src))
    for (const script of ['space-bundle.mjs', 'install-bundle.mjs']) {
        await copy(path.join(ROOT, 'scripts', script), path.join(stage, 'scripts', script))
    }
    // Both compose files. The .di override is only an override (`!reset`
    // tags, no volume definitions) — packed without its base, docker mode
    // composed a stack whose named data volume never existed, and the work
    // landed in an anonymous volume `di where` never mentioned.
    for (const composeName of ['docker-compose.yml', 'docker-compose.di.yml']) {
        if (fs.existsSync(path.join(ROOT, composeName))) {
            await copy(path.join(ROOT, composeName), path.join(stage, composeName))
        }
    }

    // ── media ──
    // Nothing to strip here. The build decided what exists: under --slim the
    // studio's pieces were never part of the graph, so there is no file to
    // delete and no surface left referring to one. The old --lean removed .mp4
    // files afterwards and had to warn that the algovrithm surface would show
    // missing media; that warning was the sign the cut was in the wrong place.
    if (args.includes('--lean')) {
        die('--lean is gone: a build either carries the studio pieces or never had them.\n'
            + '  program + works (128 MB):  npm run di:pack\n'
            + '  program alone (15 MB):     npm run di:pack -- --slim\n'
            + '  the hosted shape:          npm run di:pack -- --full')
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

    // The schema this build can read, lifted out of db.js rather than restated:
    // `di update` compares it against the artist's own database before it flips
    // anything, and `di update --rollback` uses it to know whether going back
    // also means going back to a snapshot. Read by pattern, and a miss is an
    // error — a missing number would silently disable both checks.
    const dbSource = await fsp.readFile(path.join(ROOT, 'serverXR', 'src', 'db.js'), 'utf8')
    const schemaMatch = /const SCHEMA_VERSION = (\d+)/.exec(dbSource)
    if (!schemaMatch) die('could not read SCHEMA_VERSION out of serverXR/src/db.js — update this packer, do not ship')
    const schemaVersion = Number(schemaMatch[1])

    // profile is recorded because it is the difference between two artifacts
    // with identical filenames, and `di status` has no other way to tell an
    // artist which one they are running.
    await fsp.writeFile(path.join(stage, 'release.json'), `${JSON.stringify({
        version,
        profile,
        // Which of the studio's own pieces this artifact can open with no
        // network. The difference an artist actually feels, so it is written
        // down rather than inferred from the profile name.
        works: marker.works,
        schemaVersion,
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
    log(`${path.relative(ROOT, archive)} — ${(size / 1024 / 1024).toFixed(1)} MB (${profile} profile)`)
    log(`sha256 ${digest}`)
}

main().catch((error) => die(String(error?.stack || error)))
