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
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'project-move.mjs')

// Spawned as a real process, like space-bundle.test.js — db.js is required
// (CommonJS) at runtime inside project-move.mjs, but importing this test
// module itself never touches node:sqlite statically, so this run() is
// mostly belt-and-braces consistency with the sibling script's tests.
const run = (args) => execFileAsync(process.execPath, [SCRIPT, ...args], { cwd: ROOT_DIR })

const tempDirs = []
const mkTemp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}
afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const withDb = (dbPath, fn) => {
    const { initDb, closeDb } = require('../serverXR/src/db.js')
    const db = initDb(dbPath)
    try { return fn(db) } finally { closeDb() }
}

const seedSpace = (dbPath, { id, publishedProjectId = null }) => {
    const now = Date.now() - 60_000
    withDb(dbPath, (db) => {
        db.prepare(`INSERT INTO spaces
            (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, id, 1, 1, 0, 'normal', publishedProjectId, null, 0, now, now, now, null)
    })
}

const seedProject = (dbPath, dataRoot, spaceId, pid, { slug = null, document = {}, collectionId = null } = {}) => {
    const now = Date.now() - 60_000
    withDb(dbPath, (db) => {
        db.prepare(`INSERT INTO projects
            (id, space_id, slug, title, document_version, source, created_at, updated_at, last_touched_at, collection_id, position, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(pid, spaceId, slug, pid, 1, 'project', now, now, now, collectionId, 0, 'live')
        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run(pid, 1, JSON.stringify({ op: 'create' }), now)
    })
    const dir = path.join(dataRoot, 'spaces', spaceId, 'projects', pid)
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(document))
    return dir
}

const readRow = (dbPath, sql, ...params) => withDb(dbPath, (db) => db.prepare(sql).get(...params))
const readRows = (dbPath, sql, ...params) => withDb(dbPath, (db) => db.prepare(sql).all(...params))

describe('project-move', () => {
    it('moves the row, the op log, and the directory; clears the shelf; puts it at the end', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })
        seedProject(dbPath, root, 'gallery-a', 'my-piece', { slug: 'my-piece', collectionId: null, document: { hello: 'world' } })
        // gallery-b already holds one project, so "end" is meaningfully position 1
        seedProject(dbPath, root, 'gallery-b', 'existing', {})
        withDb(dbPath, (db) => db.prepare('UPDATE projects SET collection_id = ? WHERE id = ?').run('some-shelf', 'my-piece'))

        const { stdout } = await run(['my-piece', '--to', 'gallery-b', '--data-root', root])
        expect(stdout).toContain('moved project "my-piece" from "gallery-a" to "gallery-b"')

        const row = readRow(dbPath, 'SELECT * FROM projects WHERE id = ?', 'my-piece')
        expect(row.space_id).toBe('gallery-b')
        expect(row.collection_id).toBeNull()
        expect(row.position).toBe(1)
        expect(row.slug).toBe('my-piece') // no collision in gallery-b — kept
        expect(row.state).toBe('live')

        expect(fs.existsSync(path.join(root, 'spaces', 'gallery-a', 'projects', 'my-piece'))).toBe(false)
        const newDocPath = path.join(root, 'spaces', 'gallery-b', 'projects', 'my-piece', 'document.json')
        expect(JSON.parse(fs.readFileSync(newDocPath, 'utf8'))).toEqual({ hello: 'world' })

        // op log survived untouched — same table, same project_id, nothing to move
        const ops = readRows(dbPath, 'SELECT version, data FROM project_ops WHERE project_id = ?', 'my-piece')
        expect(ops).toHaveLength(1)
        expect(JSON.parse(ops[0].data)).toEqual({ op: 'create' })

        const move = readRow(dbPath, 'SELECT * FROM project_moves WHERE project_id = ?', 'my-piece')
        expect(move).toMatchObject({ from_space: 'gallery-a', to_space: 'gallery-b', old_slug: 'my-piece' })
    })

    it('refuses an unknown target space', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedProject(dbPath, root, 'gallery-a', 'my-piece', {})

        const err = await run(['my-piece', '--to', 'nope', '--data-root', root]).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('target space "nope" not found')
        expect(readRow(dbPath, 'SELECT space_id FROM projects WHERE id = ?', 'my-piece').space_id).toBe('gallery-a')
    })

    it('refuses an unknown project', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })

        const err = await run(['ghost', '--to', 'gallery-b', '--data-root', root]).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('project "ghost" not found')
    })

    it('refuses to move a project the source space currently publishes, unless --unpublish', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a', publishedProjectId: 'my-piece' })
        seedSpace(dbPath, { id: 'gallery-b' })
        seedProject(dbPath, root, 'gallery-a', 'my-piece', {})

        const err = await run(['my-piece', '--to', 'gallery-b', '--data-root', root]).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('--unpublish')
        expect(readRow(dbPath, 'SELECT space_id FROM projects WHERE id = ?', 'my-piece').space_id).toBe('gallery-a')

        const { stdout } = await run(['my-piece', '--to', 'gallery-b', '--data-root', root, '--unpublish'])
        expect(stdout).toContain('cleared "gallery-a".published_project_id')
        expect(readRow(dbPath, 'SELECT published_project_id FROM spaces WHERE id = ?', 'gallery-a').published_project_id).toBeNull()
        expect(readRow(dbPath, 'SELECT space_id FROM projects WHERE id = ?', 'my-piece').space_id).toBe('gallery-b')
    })

    it('copies a space-scoped asset the document references, and rewrites its URL', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })
        const assetId = 'a1b2c3d4-cafe-babe-0000-111122223333'
        seedProject(dbPath, root, 'gallery-a', 'my-piece', {
            document: { background: `/api/spaces/gallery-a/assets/${assetId}` }
        })
        const spaceAssetsDir = path.join(root, 'spaces', 'gallery-a', 'assets')
        fs.mkdirSync(spaceAssetsDir, { recursive: true })
        fs.writeFileSync(path.join(spaceAssetsDir, assetId), 'fake-image-bytes')
        fs.writeFileSync(path.join(spaceAssetsDir, `${assetId}.json`), JSON.stringify({ mimeType: 'image/webp' }))

        const { stdout } = await run(['my-piece', '--to', 'gallery-b', '--data-root', root])
        expect(stdout).toContain('copied 1 space-scoped asset(s)')

        expect(fs.readFileSync(path.join(root, 'spaces', 'gallery-b', 'assets', assetId), 'utf8')).toBe('fake-image-bytes')
        expect(JSON.parse(fs.readFileSync(path.join(root, 'spaces', 'gallery-b', 'assets', `${assetId}.json`), 'utf8')).mimeType).toBe('image/webp')
        // original is NEVER deleted from the source space
        expect(fs.existsSync(path.join(spaceAssetsDir, assetId))).toBe(true)

        const doc = JSON.parse(fs.readFileSync(path.join(root, 'spaces', 'gallery-b', 'projects', 'my-piece', 'document.json'), 'utf8'))
        expect(doc.background).toBe(`/api/spaces/gallery-b/assets/${assetId}`)
    })

    it('copies a project-owned blob (content-addressed asset) out of the source space\'s blob store', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })
        const projectDir = seedProject(dbPath, root, 'gallery-a', 'my-piece', {})
        const hash = 'f'.repeat(64) // sha256-shaped id
        fs.writeFileSync(path.join(projectDir, 'assets', `${hash}.json`), JSON.stringify({ mimeType: 'image/png' }))
        const blobsDir = path.join(root, 'spaces', 'gallery-a', 'blobs')
        fs.mkdirSync(blobsDir, { recursive: true })
        fs.writeFileSync(path.join(blobsDir, hash), 'blob-bytes')

        const { stdout } = await run(['my-piece', '--to', 'gallery-b', '--data-root', root])
        expect(stdout).toContain('copied 1 project-owned blob asset(s)')
        expect(fs.readFileSync(path.join(root, 'spaces', 'gallery-b', 'blobs', hash), 'utf8')).toBe('blob-bytes')
        expect(fs.existsSync(path.join(blobsDir, hash))).toBe(true) // source blob store untouched
    })

    it('--dry-run reports what would happen and writes nothing', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })
        seedProject(dbPath, root, 'gallery-a', 'my-piece', { slug: 'my-piece' })

        const { stdout } = await run(['my-piece', '--to', 'gallery-b', '--data-root', root, '--dry-run'])
        expect(stdout).toContain('DRY RUN')
        expect(stdout).toContain('nothing written')

        expect(readRow(dbPath, 'SELECT space_id FROM projects WHERE id = ?', 'my-piece').space_id).toBe('gallery-a')
        expect(readRow(dbPath, 'SELECT * FROM project_moves WHERE project_id = ?', 'my-piece')).toBeUndefined()
        expect(fs.existsSync(path.join(root, 'spaces', 'gallery-a', 'projects', 'my-piece'))).toBe(true)
        expect(fs.existsSync(path.join(root, 'spaces', 'gallery-b', 'projects', 'my-piece'))).toBe(false)
    })

    it('drops a colliding slug rather than refusing the move', async () => {
        const root = mkTemp('project-move-')
        const dbPath = path.join(root, 'di.db')
        seedSpace(dbPath, { id: 'gallery-a' })
        seedSpace(dbPath, { id: 'gallery-b' })
        seedProject(dbPath, root, 'gallery-a', 'piece-one', { slug: 'shared-name' })
        seedProject(dbPath, root, 'gallery-b', 'piece-two', { slug: 'shared-name' })

        const { stdout } = await run(['piece-one', '--to', 'gallery-b', '--data-root', root])
        expect(stdout).toContain('collided in "gallery-b" — cleared')
        expect(readRow(dbPath, 'SELECT slug FROM projects WHERE id = ?', 'piece-one').slug).toBeNull()
        expect(readRow(dbPath, 'SELECT slug FROM projects WHERE id = ?', 'piece-two').slug).toBe('shared-name')
    })
})
