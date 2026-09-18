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

// 2026-09-18: a collaborator's WCC export was imported over a space that held
// eight projects the file did not carry. `INSERT OR REPLACE INTO spaces`
// deleted the row first, the cascade took all eight (and their op logs), the
// space directory was removed whole, and label + owner reset to the file's
// (id-as-label, no owner). Nothing said so. These guard each half.
describe('space-bundle forced replace keeps what the file does not carry', () => {
    const seedProject = (dbPath, dataRoot, spaceId, pid, body) => {
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(dbPath)
        const now = Date.now() - 60_000
        db.prepare('INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(pid, spaceId, pid, 1, 'project', now, now, now)
        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)').run(pid, 1, '{}', now)
        closeDb()
        const dir = path.join(dataRoot, 'spaces', spaceId, 'projects', pid)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify({ body }))
    }
    const read = (dbPath, sql, ...params) => {
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(dbPath)
        const rows = db.prepare(sql).all(...params)
        closeDb()
        return rows
    }
    const setUp = async () => {
        const past = Date.now() - 120_000
        // the collaborator's install: space `gallery`, label never set, one project
        const theirs = mkTemp('bundle-theirs-')
        seedSpace(path.join(theirs, 'di.db'), { id: 'gallery', updatedAt: past })
        seedProject(path.join(theirs, 'di.db'), theirs, 'gallery', 'gallery-main', 'theirs')
        const file = path.join(mkTemp('bundle-file-'), 'gallery.diiii')
        seedProject(path.join(theirs, 'di.db'), theirs, 'gallery', 'gallery-binned', 'binned')
        {
            const { initDb, closeDb } = require('../serverXR/src/db.js')
            const db = initDb(path.join(theirs, 'di.db'))
            db.prepare('UPDATE projects SET state = ?, deleted_at = ? WHERE id = ?').run('draft', 1789001446736, 'gallery-binned')
            closeDb()
        }
        await run(['export', 'gallery', '--data-root', theirs, '--out', file])
        // the tier: same space with a real label, the same project, and one more
        const tier = mkTemp('bundle-tier-')
        const tierDb = path.join(tier, 'di.db')
        seedSpace(tierDb, { id: 'gallery', updatedAt: past })
        seedProject(tierDb, tier, 'gallery', 'gallery-main', 'ours-old')
        seedProject(tierDb, tier, 'gallery', 'gallery-history', 'history')
        const { initDb, closeDb } = require('../serverXR/src/db.js')
        const db = initDb(tierDb)
        db.prepare('UPDATE spaces SET label = ? WHERE id = ?').run('The Gallery', 'gallery')
        closeDb()
        return { file, tier, tierDb }
    }

    it('keeps the extra project (row, op log, document), the label, and writes a before-copy', async () => {
        const { file, tier, tierDb } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--force-stale'])
        expect(stdout).toContain('gallery-history')
        expect(read(tierDb, 'SELECT id FROM projects WHERE space_id = ? ORDER BY id', 'gallery').map((r) => r.id))
            .toEqual(['gallery-binned', 'gallery-history', 'gallery-main'])
        // a trashed draft stays a trashed draft on the way in
        expect(read(tierDb, 'SELECT state, deleted_at FROM projects WHERE id = ?', 'gallery-binned')[0])
            .toEqual({ state: 'draft', deleted_at: 1789001446736 })
        expect(read(tierDb, 'SELECT count(*) AS n FROM project_ops WHERE project_id = ?', 'gallery-history')[0].n).toBe(1)
        expect(JSON.parse(fs.readFileSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-history', 'document.json'), 'utf8')).body).toBe('history')
        expect(JSON.parse(fs.readFileSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-main', 'document.json'), 'utf8')).body).toBe('theirs')
        expect(read(tierDb, 'SELECT label FROM spaces WHERE id = ?', 'gallery')[0].label).toBe('The Gallery')
        const backups = fs.readdirSync(path.join(tier, '_backups', 'space-replace'))
        expect(backups).toHaveLength(1)
        expect(backups[0]).toMatch(/^gallery-.*\.diiii$/)
    })

    it('--prune deletes the extra project, and says which', async () => {
        const { file, tier, tierDb } = await setUp()
        const { stdout } = await run(['import', file, '--data-root', tier, '--force', '--force-stale', '--prune'])
        expect(stdout).toMatch(/gallery-history[\s\S]*DELETED/)
        expect(read(tierDb, 'SELECT id FROM projects WHERE space_id = ?', 'gallery').map((r) => r.id).sort()).toEqual(['gallery-binned', 'gallery-main'])
        expect(fs.existsSync(path.join(tier, 'spaces', 'gallery', 'projects', 'gallery-history'))).toBe(false)
        expect(fs.readdirSync(path.join(tier, '_backups', 'space-replace'))).toHaveLength(1)
    })
})
