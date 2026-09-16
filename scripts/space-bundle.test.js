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
