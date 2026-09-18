import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'space-bundle.mjs')

// Spawned as a real process, not imported — space-bundle.mjs's static
// `import … from 'node:sqlite'` (used only inside exportSpace) makes
// Vite's test transform fail to even load the module, the same reason
// gc-space-blobs.test.js spawns its script instead of importing it.
const run = (args) => execFileAsync(process.execPath, [SCRIPT, ...args], { cwd: ROOT_DIR })

// Seeds one `spaces` row directly, using the exact column list `importSpace`
// itself writes with (see space-bundle.mjs's `insertSpace`) — so this stays
// correct against the real, migrated schema without hand-guessing it.
const seedSpace = (dbPath, { id, updatedAt }) => {
    const { initDb, closeDb } = require('../serverXR/src/db.js')
    const db = initDb(dbPath)
    db.prepare(`INSERT INTO spaces
        (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, id, 1, 1, 0, 'normal', null, null, 0, updatedAt, updatedAt, updatedAt, null)
    closeDb()
}

const tempDirs = []
const mkTemp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('space-bundle import refuses a target that changed after the bundle was exported', () => {
    it('refuses --force when the target was touched after this bundle was exported', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])

        // Simulate "someone changed the target after this bundle was made":
        // the target's own updated_at is later than the bundle's exportedAt.
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: Date.now() + 60_000 })

        const err = await run(['import', bundlePath, '--data-root', targetRoot, '--force']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('changed after this bundle was exported')
        expect(err.stderr).toContain('--force --force-stale')
    })

    it('--force --force-stale overwrites anyway', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: Date.now() + 60_000 })

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot, '--force', '--force-stale'])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })

    it('--force alone is enough when the target has not changed since the export', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])
        // Target exists, but was last touched BEFORE the export ran.
        seedSpace(path.join(targetRoot, 'di.db'), { id: 'myspace', updatedAt: 500 })

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot, '--force'])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })

    it('a brand-new target (no existing space) needs no staleness check at all', async () => {
        const sourceRoot = mkTemp('space-bundle-source-')
        const targetRoot = mkTemp('space-bundle-target-')
        const outDir = mkTemp('space-bundle-out-')
        const bundlePath = path.join(outDir, 'myspace.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'myspace', updatedAt: 1_000 })
        await run(['export', 'myspace', '--data-root', sourceRoot, '--out', bundlePath])

        const { stdout } = await run(['import', bundlePath, '--data-root', targetRoot])
        expect(stdout).toContain('imported "myspace" as "myspace"')
    })
})

// serverXR/Dockerfile copies the server to /app/src and this script to
// /app/scripts -- no serverXR/ directory above either. The two routes that
// spawn it (save a space to a file, open a file) answered 500 on every hosted
// tier from 2026-08-19 to 2026-09-17 because the image had no tool at all; a
// tool that then looked for ../serverXR/src would have failed the same way one
// step later. Staged here from the real files, so a Dockerfile that stops
// copying the script, or a script that forgets the layout, fails this test.
describe('space-bundle runs from the server image\'s layout', () => {
    const stageImage = () => {
        const image = mkTemp('space-bundle-image-')
        const app = path.join(image, 'app')
        fs.mkdirSync(path.join(app, 'src'), { recursive: true })
        fs.mkdirSync(path.join(app, 'scripts'), { recursive: true })
        fs.copyFileSync(path.join(ROOT_DIR, 'serverXR', 'src', 'db.js'), path.join(app, 'src', 'db.js'))
        fs.copyFileSync(SCRIPT, path.join(app, 'scripts', 'space-bundle.mjs'))
        // What the Dockerfile writes: deploy facts, no schemaVersion -- the tool
        // has to read that out of ./src/db.js.
        fs.writeFileSync(path.join(app, 'release.json'), JSON.stringify({ deployEnv: 'test', gitCommit: 'abc' }))
        return app
    }
    const runStaged = (app, args) => execFileAsync(process.execPath, [path.join(app, 'scripts', 'space-bundle.mjs'), ...args], { cwd: app })

    it('the Dockerfile ships the tool beside the server', () => {
        const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'serverXR', 'Dockerfile'), 'utf8')
        expect(dockerfile).toMatch(/^COPY scripts\/space-bundle\.mjs \.\/scripts\/space-bundle\.mjs$/m)
    })

    it('exports and imports with the server at ./src, stamping the real schema version', async () => {
        const app = stageImage()
        const sourceRoot = mkTemp('space-bundle-image-data-a-')
        const targetRoot = mkTemp('space-bundle-image-data-b-')
        const bundlePath = path.join(mkTemp('space-bundle-image-out-'), 'imaged.diiii')

        seedSpace(path.join(sourceRoot, 'di.db'), { id: 'imaged', updatedAt: 1_000 })
        const { stdout: exported } = await runStaged(app, ['export', 'imaged', '--data-root', sourceRoot, '--out', bundlePath])
        expect(exported).toContain('exported space "imaged"')

        const dbSource = fs.readFileSync(path.join(ROOT_DIR, 'serverXR', 'src', 'db.js'), 'utf8')
        const schemaVersion = Number(/const SCHEMA_VERSION = (\d+)/.exec(dbSource)[1])
        const unpacked = mkTemp('space-bundle-image-unpacked-')
        await execFileAsync('tar', ['-xzf', path.basename(bundlePath), '-C', unpacked], { cwd: path.dirname(bundlePath) })
        const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'bundle.json'), 'utf8'))
        expect(manifest.schemaVersion).toBe(schemaVersion)

        const { stdout: imported } = await runStaged(app, ['import', bundlePath, '--data-root', targetRoot])
        expect(imported).toContain('imported "imaged" as "imaged"')
        expect(fs.existsSync(path.join(targetRoot, 'di.db'))).toBe(true)
    })
})
