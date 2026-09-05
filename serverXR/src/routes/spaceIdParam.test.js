// @vitest-environment node

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceIdParam } = require('./spaceIdParam.js')

describe('createSpaceIdParam (unit)', () => {
  it('leaves an unresolvable segment for the route handler to 404 on', async () => {
    const normalizeSpaceId = vi.fn((v) => (v === 'bad segment' ? null : v))
    const spaceExists = vi.fn().mockResolvedValue(false)
    const findSpaceBySlug = vi.fn().mockResolvedValue(null)
    const middleware = createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug })
    const req = { params: { spaceId: 'bad segment' } }
    const next = vi.fn()
    await middleware(req, {}, next, 'bad segment')
    expect(req.params.spaceId).toBe('bad segment')
    expect(next).toHaveBeenCalledWith()
    expect(spaceExists).not.toHaveBeenCalled()
  })

  it('an id short-circuits before any slug lookup runs — a slug can never shadow an id', async () => {
    const normalizeSpaceId = vi.fn((v) => v)
    const spaceExists = vi.fn().mockResolvedValue(true)
    const findSpaceBySlug = vi.fn().mockResolvedValue({ id: 'someone-else' })
    const middleware = createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug })
    const req = { params: { spaceId: 'cascade' } }
    const next = vi.fn()
    await middleware(req, {}, next, 'cascade')
    expect(req.params.spaceId).toBe('cascade')
    expect(findSpaceBySlug).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('resolves a slug to the real id when no space owns that id', async () => {
    const normalizeSpaceId = vi.fn((v) => v)
    const spaceExists = vi.fn().mockResolvedValue(false)
    const findSpaceBySlug = vi.fn().mockResolvedValue({ id: 'cascade' })
    const middleware = createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug })
    const req = { params: { spaceId: 'cascade-club' } }
    const next = vi.fn()
    await middleware(req, {}, next, 'cascade-club')
    expect(req.params.spaceId).toBe('cascade')
    expect(next).toHaveBeenCalledWith()
  })

  it('leaves an unknown segment untouched (neither id nor slug) so the route 404s', async () => {
    const normalizeSpaceId = vi.fn((v) => v)
    const spaceExists = vi.fn().mockResolvedValue(false)
    const findSpaceBySlug = vi.fn().mockResolvedValue(null)
    const middleware = createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug })
    const req = { params: { spaceId: 'nothing-here' } }
    const next = vi.fn()
    await middleware(req, {}, next, 'nothing-here')
    expect(req.params.spaceId).toBe('nothing-here')
    expect(next).toHaveBeenCalledWith()
  })

  it('passes a store error to next() instead of throwing', async () => {
    const normalizeSpaceId = vi.fn((v) => v)
    const spaceExists = vi.fn().mockRejectedValue(new Error('db down'))
    const findSpaceBySlug = vi.fn()
    const middleware = createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug })
    const req = { params: { spaceId: 'cascade' } }
    const next = vi.fn()
    await middleware(req, {}, next, 'cascade')
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

// ── mounted the way index.js mounts it: one router.param('spaceId', ...) in
// front of every route matching :spaceId on the same router — spaceRoutes,
// projectRoutes, syncRoutes, inscriptionRoutes all share it. Real
// createSpaceStore + real HTTP requests, no subprocess (see ogRoutes.test.js
// for the same pattern) — this is what proves the router.param registration
// itself, not just the resolver function above, does the right thing end to
// end.
describe('the :spaceId param, through a real router', () => {
  const express = require('express')
  const { initDb, closeDb } = require('../db.js')
  const { createSpaceStore } = require('../spaceStore.js')
  const { registerProjectRoutes } = require('./projectRoutes.js')

  let tmpDir
  let store
  let app

  beforeEach(async () => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'space-id-param-'))
    store = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })

    await store.saveSpaceMeta('cascade', store.buildMeta('cascade', { label: 'Cascade Club', isPublic: true }))
    await store.upsertSpaceMeta('cascade', { slug: 'cascade-club' })
    await store.saveSpaceMeta('other', store.buildMeta('other', { label: 'Other' }))

    const router = express.Router()
    router.param('spaceId', createSpaceIdParam({
      normalizeSpaceId: store.normalizeSpaceId,
      spaceExists: store.spaceExists,
      findSpaceBySlug: store.findSpaceBySlug
    }))

    // Mirrors GET /api/spaces/:spaceId (spaceRoutes.js) closely enough to
    // prove the response body carries the real id, without pulling in that
    // route's full dependency list.
    router.get('/api/spaces/:spaceId', async (req, res) => {
      const meta = await store.loadSpaceMeta(req.params.spaceId)
      if (!meta) return res.status(404).json({ error: 'Space not found.' })
      res.json({ space: meta })
    })

    registerProjectRoutes(router, {
      normalizeSpaceId: store.normalizeSpaceId,
      spaceExists: store.spaceExists,
      spacesDir: tmpDir,
      listProjectsInSpace: async (_dir, spaceId) => ([{ spaceId, projectId: 'p1' }]),
      upload: { single: () => (req, res, next) => next() }
    })

    app = express()
    app.use(router)
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const hit = (reqPath) => new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${server.address().port}${reqPath}`)
        const body = await r.json().catch(() => null)
        server.close(() => resolve({ status: r.status, body }))
      } catch (error) {
        server.close(() => reject(error))
      }
    })
  })

  it('an id resolves directly', async () => {
    const r = await hit('/api/spaces/cascade')
    expect(r.status).toBe(200)
    expect(r.body.space.id).toBe('cascade')
  })

  it('a slug resolves to the space, and the response carries the real id', async () => {
    const r = await hit('/api/spaces/cascade-club')
    expect(r.status).toBe(200)
    expect(r.body.space.id).toBe('cascade')
    expect(r.body.space.slug).toBe('cascade-club')
  })

  it('an id always wins — a slug can never shadow another space\'s real id', async () => {
    // "other"'s id must never be reachable through a slug that happens to
    // match it; simulate the shadow attempt directly against the store,
    // bypassing the PATCH-time guard that normally rejects it, so this test
    // proves the read path defends itself independently of that guard.
    const raw = require('../db.js').getDb()
    raw.prepare('UPDATE spaces SET slug = ? WHERE id = ?').run('other', 'cascade')

    const r = await hit('/api/spaces/other')
    expect(r.status).toBe(200)
    // Must be the real "other" space, not "cascade" hijacking the address
    // through its shadowing slug.
    expect(r.body.space.id).toBe('other')
  })

  it('an unknown segment 404s, same as an unknown id always has', async () => {
    const r = await hit('/api/spaces/nothing-lives-here')
    expect(r.status).toBe(404)
  })

  it('a project-scoped route resolves the space through a slug too', async () => {
    const r = await hit('/api/spaces/cascade-club/projects')
    expect(r.status).toBe(200)
    expect(r.body.projects).toEqual([{ spaceId: 'cascade', projectId: 'p1' }])
  })
})
