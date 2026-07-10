/**
 * install-bundle.mjs — export a whole install (every space + instance config)
 * to one portable archive, or import one onto a fresh data root.
 *
 * An install bundle is a tar.gz of per-space bundles (scripts/space-bundle.mjs
 * format, secrets stripped the same way) plus the admin instance config
 * (`spaces/_server-config.json` — globalSpaceId etc.). Users are NOT included:
 * accounts, sessions, and OAuth links are install-specific; space owner ids
 * are dropped exactly as in single-space bundles.
 *
 * Usage:
 *   node scripts/install-bundle.mjs export [options]
 *   node scripts/install-bundle.mjs import <bundle.tar.gz> [options]
 *
 * Options (both):
 *   --data-root <dir>   serverXR data root (default: $DATA_ROOT or serverXR/data)
 *
 * Export options:
 *   --spaces <a,b,c>    Only these space ids (default: every space in the DB)
 *   --out <file>        Output path (default: di.install-bundle.tar.gz)
 *
 * Import options:
 *   --owner <userId>    Set owner_user_id on every imported space
 *   --force             Overwrite existing spaces and instance config
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { exportSpace, importSpace, resolvePaths, SLUG_REGEX } from './space-bundle.mjs'

const BUNDLE_FORMAT = 'di.install-bundle'
const BUNDLE_VERSION = 1
const CONFIG_FILENAME = '_server-config.json'

const die = (msg) => { console.error(`[install-bundle] ERROR: ${msg}`); process.exit(1) }
const log = (msg) => console.log(`[install-bundle] ${msg}`)

const parseArgs = (argv) => {
    const args = { command: null, target: null, dataRoot: null, out: null, spaces: null, owner: null, force: false }
    const positional = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--data-root') args.dataRoot = argv[++i]
        else if (a === '--out') args.out = argv[++i]
        else if (a === '--spaces') args.spaces = argv[++i]
        else if (a === '--owner') args.owner = argv[++i]
        else if (a === '--force') args.force = true
        else if (a.startsWith('--')) die(`unknown option ${a}`)
        else positional.push(a)
    }
    args.command = positional[0] || null
    args.target = positional[1] || null
    return args
}

const readJson = async (file) => JSON.parse(await fsp.readFile(file, 'utf8'))

// ---------------------------------------------------------------- export

async function exportInstall(args) {
    const { spacesDir, dbPath } = resolvePaths(args.dataRoot)
    if (!fs.existsSync(dbPath)) die(`no database at ${dbPath} — wrong --data-root?`)

    let db
    try { db = new DatabaseSync(dbPath, { readOnly: true }) }
    catch { db = new DatabaseSync(dbPath) }
    const allIds = db.prepare('SELECT id FROM spaces ORDER BY created_at ASC').all().map((r) => r.id)
    db.close()

    let spaceIds = allIds
    if (args.spaces) {
        spaceIds = args.spaces.split(',').map((s) => s.trim()).filter(Boolean)
        for (const id of spaceIds) {
            if (!SLUG_REGEX.test(id)) die(`invalid space id "${id}"`)
            if (!allIds.includes(id)) die(`space "${id}" not found in ${dbPath}`)
        }
    }
    if (!spaceIds.length) die('nothing to export — no spaces in the database')

    const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'install-bundle-'))
    try {
        await fsp.mkdir(path.join(staging, 'spaces'), { recursive: true })
        for (const id of spaceIds) {
            await exportSpace({
                target: id,
                dataRoot: args.dataRoot,
                out: path.join(staging, 'spaces', `${id}.space-bundle.tar.gz`)
            })
        }

        const configSrc = path.join(spacesDir, CONFIG_FILENAME)
        const hasConfig = fs.existsSync(configSrc)
        if (hasConfig) {
            await fsp.mkdir(path.join(staging, 'config'), { recursive: true })
            await fsp.copyFile(configSrc, path.join(staging, 'config', CONFIG_FILENAME))
        }

        const manifest = {
            format: BUNDLE_FORMAT,
            version: BUNDLE_VERSION,
            exportedAt: new Date().toISOString(),
            spaces: spaceIds,
            config: hasConfig
        }
        await fsp.writeFile(path.join(staging, 'install.json'), JSON.stringify(manifest, null, 2))

        const out = path.resolve(args.out || 'di.install-bundle.tar.gz')
        execFileSync('tar', ['-czf', out, '-C', staging, '.'])
        const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
        log(`exported install → ${out} (${size} MB, ${spaceIds.length} spaces${hasConfig ? ', instance config' : ''})`)
        return out
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }
}

// ---------------------------------------------------------------- import

async function importInstall(args) {
    const { dataRoot, spacesDir } = resolvePaths(args.dataRoot)
    const bundlePath = args.target && path.resolve(args.target)
    if (!bundlePath || !fs.existsSync(bundlePath)) die(`bundle not found: ${args.target}`)

    const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'install-bundle-'))
    try {
        execFileSync('tar', ['-xzf', bundlePath, '-C', staging])

        const manifestPath = path.join(staging, 'install.json')
        if (!fs.existsSync(manifestPath)) die('not an install bundle: install.json missing (single-space bundle? use space:import)')
        const manifest = await readJson(manifestPath)
        if (manifest.format !== BUNDLE_FORMAT) die(`unknown bundle format "${manifest.format}"`)
        if (manifest.version > BUNDLE_VERSION) die(`bundle version ${manifest.version} is newer than this tool (${BUNDLE_VERSION})`)

        for (const id of manifest.spaces) {
            const nested = path.join(staging, 'spaces', `${id}.space-bundle.tar.gz`)
            if (!fs.existsSync(nested)) die(`corrupt bundle: spaces/${id}.space-bundle.tar.gz missing`)
            await importSpace({
                target: nested,
                dataRoot: args.dataRoot,
                as: null,
                owner: args.owner,
                force: args.force
            })
        }

        const configSrc = path.join(staging, 'config', CONFIG_FILENAME)
        if (manifest.config && fs.existsSync(configSrc)) {
            const configDst = path.join(spacesDir, CONFIG_FILENAME)
            if (fs.existsSync(configDst) && !args.force) {
                log(`instance config kept — ${configDst} already exists (use --force to overwrite)`)
            } else {
                await fsp.mkdir(spacesDir, { recursive: true })
                await fsp.copyFile(configSrc, configDst)
                log(`instance config → ${configDst}`)
            }
        }

        log(`imported install into ${dataRoot} (${manifest.spaces.length} spaces: ${manifest.spaces.join(', ')})`)
        return manifest.spaces
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }
}

// ---------------------------------------------------------------- main

const invokedDirectly = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
    const args = parseArgs(process.argv.slice(2))
    if (args.command === 'export') await exportInstall(args)
    else if (args.command === 'import') await importInstall(args)
    else {
        console.log('Usage: node scripts/install-bundle.mjs export [--data-root <dir>] [--spaces <a,b,c>] [--out <file>]')
        console.log('       node scripts/install-bundle.mjs import <bundle.tar.gz> [--data-root <dir>] [--owner <userId>] [--force]')
        process.exit(args.command ? 1 : 0)
    }
}
