// @vitest-environment node
//
// projectMove.js — the one move, shared by POST /api/projects/:id/move and
// scripts/project-move.mjs. Real sqlite, real directories, no server.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const { moveProjectBetweenSpaces, MoveRefused } = require('./projectMove.js')

const HASH = 'a'.repeat(64)
const dirs = []
afterEach(() => {
  try { closeDb() } catch { /* not open */ }
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const world = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-move-'))
  dirs.push(root)
  const spacesDir = path.join(root, 'spaces')
  const db = initDb(path.join(root, 'di.db'))
  const now = Date.now() - 60_000
  for (const id of ['src', 'dst']) {
    db.prepare(`INSERT INTO spaces (id, label, permanent, allow_edits, is_public, kind, published_project_id, preview_image_asset_id, scene_version, created_at, updated_at, last_touched_at, owner_user_id)
      VALUES (?, ?, 1, 1, 0, 'normal', NULL, NULL, 0, ?, ?, ?, NULL)`).run(id, id, now, now, now)
  }
  const project = (spaceId, id, { slug = null, doc = {}, pos = 0 } = {}) => {
    db.prepare(`INSERT INTO projects (id, space_id, slug, title, document_version, source, created_at, updated_at, last_touched_at, collection_id, position, state)
      VALUES (?, ?, ?, ?, 1, 'project', ?, ?, ?, NULL, ?, 'live')`).run(id, spaceId, slug, id, now, now, now, pos)
    db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, 1, ?, ?)').run(id, JSON.stringify({ type: 'create' }), now)
    const dir = path.join(spacesDir, spaceId, 'projects', id)
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(doc))
    return dir
  }
  return { root, spacesDir, db, project }
}
const mv = (w, extra = {}) => moveProjectBetweenSpaces({ db: w.db, spacesDir: w.spacesDir, projectId: 'p1', toSpaceId: 'dst', ...extra })

describe('moveProjectBetweenSpaces', () => {
  it('moves row, directory and the op log stays; records the move', async () => {
    const w = world()
    w.project('src', 'p1', { slug: 'my-slug', doc: { a: 1 } })
    w.project('dst', 'other', { pos: 4 })
    const r = await mv(w)
    expect(r).toMatchObject({ fromSpaceId: 'src', toSpaceId: 'dst', position: 5, slug: 'my-slug' })
    const row = w.db.prepare('SELECT * FROM projects WHERE id = ?').get('p1')
    expect(row).toMatchObject({ space_id: 'dst', slug: 'my-slug', collection_id: null, position: 5 })
    expect(fs.existsSync(path.join(w.spacesDir, 'src', 'projects', 'p1'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(w.spacesDir, 'dst', 'projects', 'p1', 'document.json'), 'utf8'))).toEqual({ a: 1 })
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM project_ops WHERE project_id = ?').get('p1').n).toBe(1)
    expect(w.db.prepare('SELECT * FROM project_moves WHERE project_id = ?').get('p1')).toMatchObject({ from_space: 'src', to_space: 'dst', old_slug: 'my-slug' })
  })

  it('refuses a slug clash (409) and changes nothing', async () => {
    const w = world()
    const dir = w.project('src', 'p1', { slug: 'same' })
    w.project('dst', 'other', { slug: 'same' })
    const err = await mv(w).catch((e) => e)
    expect(err).toBeInstanceOf(MoveRefused)
    expect(err.status).toBe(409)
    expect(err.code).toBe('slug_clash')
    expect(fs.existsSync(dir)).toBe(true)
    expect(w.db.prepare('SELECT space_id FROM projects WHERE id = ?').get('p1').space_id).toBe('src')
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM project_moves').get().n).toBe(0)
  })

  it('the offline script may drop a clashing slug instead', async () => {
    const w = world()
    w.project('src', 'p1', { slug: 'same' })
    w.project('dst', 'other', { slug: 'same' })
    const r = await mv(w, { onSlugClash: 'drop' })
    expect(r.slugDropped).toBe(true)
    expect(w.db.prepare('SELECT slug FROM projects WHERE id = ?').get('p1').slug).toBeNull()
  })

  it('refuses unknown project, unknown target, same space', async () => {
    const w = world()
    w.project('src', 'p1')
    expect((await mv(w, { projectId: 'ghost' }).catch((e) => e)).status).toBe(404)
    expect((await mv(w, { toSpaceId: 'nope' }).catch((e) => e)).status).toBe(404)
    expect((await mv(w, { toSpaceId: 'src' }).catch((e) => e)).status).toBe(400)
  })

  it('refuses the source front door unless unpublish, then clears it', async () => {
    const w = world()
    w.project('src', 'p1')
    w.db.prepare('UPDATE spaces SET published_project_id = ? WHERE id = ?').run('p1', 'src')
    expect((await mv(w).catch((e) => e)).code).toBe('is_published')
    await mv(w, { unpublish: true })
    expect(w.db.prepare('SELECT published_project_id FROM spaces WHERE id = ?').get('src').published_project_id).toBeNull()
  })

  it('refuses when the target already holds a directory for the id', async () => {
    const w = world()
    w.project('src', 'p1')
    fs.mkdirSync(path.join(w.spacesDir, 'dst', 'projects', 'p1'), { recursive: true })
    expect((await mv(w).catch((e) => e)).code).toBe('target_dir_exists')
  })

  it('dry run reports and writes nothing', async () => {
    const w = world()
    const dir = w.project('src', 'p1')
    const r = await mv(w, { dryRun: true })
    expect(r.dryRun).toBe(true)
    expect(fs.existsSync(dir)).toBe(true)
    expect(w.db.prepare('SELECT space_id FROM projects WHERE id = ?').get('p1').space_id).toBe('src')
  })

  it('carries the blob bytes and a space asset, and rewrites the link', async () => {
    const w = world()
    const dir = w.project('src', 'p1', { doc: { img: '/api/spaces/src/assets/abcd1234-ef' } })
    fs.writeFileSync(path.join(dir, 'assets', `${HASH}.json`), '{}')
    fs.mkdirSync(path.join(w.spacesDir, 'src', 'blobs'), { recursive: true })
    fs.writeFileSync(path.join(w.spacesDir, 'src', 'blobs', HASH), 'bytes')
    fs.mkdirSync(path.join(w.spacesDir, 'src', 'assets'), { recursive: true })
    fs.writeFileSync(path.join(w.spacesDir, 'src', 'assets', 'abcd1234-ef'), 'pic')
    const r = await mv(w)
    expect(r).toMatchObject({ blobsCopied: 1, spaceAssetsCopied: 1 })
    expect(fs.readFileSync(path.join(w.spacesDir, 'dst', 'blobs', HASH), 'utf8')).toBe('bytes')
    expect(fs.readFileSync(path.join(w.spacesDir, 'dst', 'assets', 'abcd1234-ef'), 'utf8')).toBe('pic')
    expect(fs.existsSync(path.join(w.spacesDir, 'src', 'blobs', HASH))).toBe(true) // source untouched
    const doc = fs.readFileSync(path.join(w.spacesDir, 'dst', 'projects', 'p1', 'document.json'), 'utf8')
    expect(doc).toContain('/api/spaces/dst/assets/abcd1234-ef')
    expect(doc).not.toContain('/api/spaces/src/')
  })

  it('is all-or-nothing: a failing database step puts the directory and the document back', async () => {
    const w = world()
    const original = { img: '/api/spaces/src/assets/abcd1234-ef' }
    const dir = w.project('src', 'p1', { doc: original })
    w.db.exec('DROP TABLE project_moves') // the last statement of the transaction will throw
    const err = await mv(w).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MoveRefused)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'document.json'), 'utf8'))).toEqual(original)
    expect(fs.existsSync(path.join(w.spacesDir, 'dst', 'projects', 'p1'))).toBe(false)
    expect(w.db.prepare('SELECT space_id FROM projects WHERE id = ?').get('p1').space_id).toBe('src')
  })
})
