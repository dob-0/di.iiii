// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerProjectRoutes } = require('./projectRoutes.js')
const { registerSpaceRoutes } = require('./spaceRoutes.js')
const { normalizeProjectId, normalizeProjectSlug } = require('../projectStore.js')

// Continue-guard 409 answers must only name what the caller may see
// (verifier #1243 finding 1). Fakes for the stores, no server process.
const outsider = { authenticated: true, role: 'editor', type: 'session', subject: 'u-out', spaces: ['elsewhere'] }

const serve = async (register, deps, authState) => {
  const router = express.Router()
  router.use(express.json())
  router.use((req, _res, next) => { req.authState = authState; next() })
  register(router, deps)
  const app = express()
  app.use(router)
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

describe('a private project of another user is not named in project_exists_similar', () => {
  let ctx
  const rows = [{ id: 'p-secret', spaceId: 'hall', slug: 'hall-scene', title: 'Hall Scene', visibility: 'private' }]
  beforeEach(async () => {
    ctx = await serve(registerProjectRoutes, {
      config: { requireAuth: true },
      canAccessSpace: () => false,
      normalizeSpaceId: (v) => String(v || '').toLowerCase() || null,
      normalizeProjectId, normalizeProjectSlug,
      spaceExists: async () => true,
      ensureSpaceWritable: async () => {},
      findAnyProjectById: async () => null,
      findProjectBySlug: async () => null,
      listProjectsInSpace: async () => rows,
      ensureProject: async (_d, spaceId, id, o) => ({ id, spaceId, slug: o.slug || null, title: o.title }),
      readProjectDocument: async () => ({}),
      spacesDir: '/nowhere',
      upload: { single: () => (req, res, next) => next() }
    }, outsider)
  })
  afterEach(() => new Promise((r) => ctx.server.close(r)))

  it('answers as if there were no match', async () => {
    const res = await fetch(`${ctx.base}/api/spaces/hall/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Hall Scene v2' })
    })
    const text = await res.text()
    expect(text).not.toMatch(/p-secret|project_exists_similar/)
    expect(res.status).not.toBe(409)
  })
})

describe('a private space of another user is not named in space_exists_similar', () => {
  let ctx
  const spaces = [
    { id: 'cinema-house', label: 'Cinema House', isPublic: false, kind: 'normal' },
    { id: 'open-hall', label: 'Open Hall', isPublic: true, kind: 'normal' }
  ]
  beforeEach(async () => {
    ctx = await serve(registerSpaceRoutes, {
      config: { requireAuth: true },
      canAccessSpace: () => false,
      appendOpsHistory: vi.fn(), applySceneOps: vi.fn(), blankScene: {}, broadcastLiveEvent: vi.fn(),
      deleteSpace: vi.fn(), ensureSpaceScene: vi.fn(), ensureSpaceWritable: vi.fn(), findProjectById: vi.fn(),
      getLiveBucket: vi.fn(), getSpacePaths: vi.fn(), hydrateSceneAssetManifest: (s) => s,
      isValidAssetId: () => true, maxOpHistory: 500, normalizeIncomingOps: vi.fn(), normalizeProjectId: (id) => id,
      normalizeSpaceId: (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') || null,
      loadSpaceMeta: vi.fn(async () => null), listSpaces: vi.fn(async () => spaces),
      spaceExists: vi.fn(async (id) => spaces.some((s) => s.id === id)),
      readJson: vi.fn(), readOpsHistory: vi.fn(), removeAssetThumbnails: vi.fn(), saveSpaceMeta: vi.fn(),
      serveAsset: vi.fn(), spacesDir: '/nonexistent', upsertSpaceMeta: vi.fn(),
      upload: { single: () => (req, res, next) => next() }, writeJson: vi.fn(), writeOpsHistory: vi.fn()
    }, outsider)
  })
  afterEach(() => new Promise((r) => ctx.server.close(r)))
  const post = (body) => fetch(`${ctx.base}/api/spaces`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('never names the private space', async () => {
    const text = await (await post({ label: 'Cinema House 3D' })).text()
    expect(text).not.toMatch(/cinema-house|space_exists_similar/)
  })
  it('still names a public one', async () => {
    const res = await post({ label: 'Open Hall 3D' })
    expect(res.status).toBe(409)
    expect((await res.json()).existing).toBe('open-hall')
  })
  it('an explicit slug is not stem-compared (finding 3)', async () => {
    const text = await (await post({ slug: 'open-hall-3d', label: 'x' })).text()
    expect(text).not.toMatch(/space_exists_similar/)
  })
})
