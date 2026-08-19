import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { registerSyncRoutes } from './syncRoutes.js'


// registerSyncRoutes only needs the plain Express-style route handlers it
// wires up — a fake router captures them without a real HTTP server.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return { routes, get: record('get'), post: record('post'), use: () => {} }
}

// Real normalizeSpaceId shape (serverXR/src/spaceStore.js): lowercase
// slug, 3-48 chars of [a-z0-9-], anything else (including a traversal
// payload with slashes/dots) returns null.
const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const normalizeSpaceId = (value) => {
  const slug = String(value || '').toLowerCase()
  return SLUG_REGEX.test(slug) ? slug : null
}

describe('registerSyncRoutes space id validation', () => {
  const setup = ({
    ensureSpaceWritable = vi.fn().mockResolvedValue({}),
    replaceSceneAndBroadcast = vi.fn().mockResolvedValue({ newVersion: 1, previousVersion: 0, objectsBefore: 0, objectsAfter: 0 }),
    ...overrides
  } = {}) => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: '', token: '' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(),
      readJson: vi.fn(),
      normalizeSpaceId,
      ensureSpaceWritable,
      replaceSceneAndBroadcast,
      ...overrides
    })
    return router
  }

  const traversalIds = ['..', '../../etc/passwd', 'foo/../../bar', '']

  for (const routeKey of [
    'get /api/sync/spaces/:spaceId/status',
    'post /api/sync/spaces/:spaceId/pull',
    'post /api/sync/spaces/:spaceId/push'
  ]) {
    it(`${routeKey} rejects a traversal/invalid space id with 400 before touching the filesystem`, async () => {
      const router = setup()
      const [handler] = router.routes[routeKey]
      for (const badId of traversalIds) {
        const req = { params: { spaceId: badId } }
        const json = vi.fn()
        const res = { status: vi.fn(() => ({ json })) }
        const next = vi.fn()
        // eslint-disable-next-line no-await-in-loop
        await handler(req, res, next)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(json).toHaveBeenCalledWith({ error: 'Invalid space id.' })
        expect(next).not.toHaveBeenCalled()
      }
    })
  }
})

// Regression test for audit finding #12: pull overwrote the local scene.json
// unconditionally — every other space-mutating route (POST /ops, PUT /scene)
// checks ensureSpaceWritable first, sync's pull route never did, so a
// space explicitly marked read-only (allowEdits: false) could still be
// overwritten via sync.
describe('registerSyncRoutes read-only enforcement', () => {
  // httpRequest is always injected: the default reaches node:https for real,
  // and `https://live.example` is a resolvable-looking host with an 8s client
  // timeout — inside a 5s test timeout that's a hang, not a failure, so the
  // suite passed only where DNS happened to reject fast.
  const setup = (
    ensureSpaceWritable,
    replaceSceneAndBroadcast = vi.fn().mockResolvedValue({ newVersion: 1, previousVersion: 0, objectsBefore: 0, objectsAfter: 0 }),
    httpRequest = vi.fn().mockRejectedValue(new Error('live server unreachable'))
  ) => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: 'https://live.example', token: '' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(() => ({ spaceDir: '/tmp/space', scenePath: '/tmp/space/scene.json', assetsDir: '/tmp/space/assets' })),
      readJson: vi.fn(),
      normalizeSpaceId,
      ensureSpaceWritable,
      replaceSceneAndBroadcast,
      httpRequest
    })
    return router
  }

  it('pull refuses to overwrite a read-only space', async () => {
    const readOnlyError = Object.assign(new Error('Space is read-only.'), { status: 403 })
    const ensureSpaceWritable = vi.fn().mockRejectedValue(readOnlyError)
    const router = setup(ensureSpaceWritable)
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const req = { params: { spaceId: 'locked-space' } }
    const res = { status: vi.fn(() => ({ json: vi.fn() })) }
    const next = vi.fn()
    await handler(req, res, next)

    expect(ensureSpaceWritable).toHaveBeenCalledWith('locked-space')
    // Rejected via next(error), same as every other route's read-only guard
    // — the global error handler turns error.status into the response code.
    expect(next).toHaveBeenCalledWith(readOnlyError)
  })

  it('pull proceeds to fetch the live scene when the space is writable', async () => {
    const ensureSpaceWritable = vi.fn().mockResolvedValue({ allowEdits: true })
    const unreachable = new Error('live server unreachable')
    const httpRequest = vi.fn().mockRejectedValue(unreachable)
    const router = setup(ensureSpaceWritable, undefined, httpRequest)
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    // expectedVersion is required now (see the refusal tests below); this test
    // is about the writable check, so it supplies one and gets out of the way.
    const req = { params: { spaceId: 'open-space' }, body: { expectedVersion: 0 } }
    const res = { status: vi.fn(() => ({ json: vi.fn() })) }
    const next = vi.fn()
    await handler(req, res, next)

    expect(ensureSpaceWritable).toHaveBeenCalledWith('open-space')
    // Reaching the live fetch at all is the point: the writable check let it
    // through. It then fails downstream on the unreachable server (next with
    // the network error), never blocked up front.
    expect(httpRequest).toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(unreachable)
  })
})

// Regression test for the 2026-07-17 audit: pull used to write scene.json
// directly and bump sceneVersion from the REMOTE scene's own embedded
// version field (`(scene.version ?? 0) + 1`), with no op-log entry and no
// SSE broadcast -- connected clients silently stopped seeing pulled scenes
// live and could hit spurious version mismatches afterward. Pull must now
// delegate the actual write to the same locked/versioned/broadcast helper
// every other whole-scene replace uses.
describe('registerSyncRoutes pull delegates the write to replaceSceneAndBroadcast', () => {
  it('pulls the live scene and writes it through replaceSceneAndBroadcast, not a hand-rolled version bump', async () => {
    const pulledScene = { version: 999, objects: [{ id: 'a' }], assets: [] }
    // missingAssetIds is what proves the peer honoured ?verbatim=1 — without
    // it the route refuses, because a filtered read written back upstream is
    // the manifest-erasure bug.
    const httpRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => ({ scene: pulledScene, version: 12, missingAssetIds: [] }),
      text: ''
    })
    const ensureSpaceWritable = vi.fn().mockResolvedValue({ allowEdits: true })
    const replaceSceneAndBroadcast = vi.fn().mockResolvedValue({ newVersion: 7, previousVersion: 6, objectsBefore: 0, objectsAfter: 1 })
    const tmpRoot = path.join(os.tmpdir(), `syncRoutes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: 'https://live.example', token: '' }, directories: { root: path.join(tmpRoot, 'spaces') } },
      getSpacePaths: vi.fn(() => ({ spaceDir: '/tmp/space', scenePath: '/tmp/space/scene.json', assetsDir: '/tmp/space/assets' })),
      readJson: vi.fn(),
      normalizeSpaceId,
      ensureSpaceWritable,
      replaceSceneAndBroadcast,
      httpRequest
    })
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const req = { params: { spaceId: 'open-space' }, body: { expectedVersion: 3 } }
    const json = vi.fn()
    const res = { status: vi.fn(() => ({ json })), json }
    const next = vi.fn()
    await handler(req, res, next)

    expect(next).not.toHaveBeenCalled()
    // The remote scene's own `version: 999` must never be used to compute
    // the local version -- that's exactly the bug. replaceSceneAndBroadcast
    // owns version bumping entirely from the local counter, and now also
    // carries the precondition the caller stated.
    expect(replaceSceneAndBroadcast).toHaveBeenCalledWith('open-space', pulledScene, { expectedVersion: 3 })
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, objects: 1, assets: 0 }))

    await fsp.rm(tmpRoot, { recursive: true, force: true })
  })
})

// The three refusals that make sync incapable of silent destruction. Each one
// replaced a path that previously wrote, or reported a loss as something else.
describe('registerSyncRoutes refuses rather than destroys', () => {
  const setupPull = ({
    httpRequest = vi.fn(),
    replaceSceneAndBroadcast = vi.fn().mockResolvedValue({ newVersion: 1, previousVersion: 0, objectsBefore: 0, objectsAfter: 0 }),
    snapshotSpaceScene = vi.fn().mockResolvedValue('/snapshots/open-space/stamp.json')
  } = {}) => {
    const router = makeFakeRouter()
    registerSyncRoutes(router, {
      config: { liveSync: { url: 'https://live.example', token: 'tok' }, directories: { root: '/data/spaces' } },
      getSpacePaths: vi.fn(() => ({ scenePath: '/tmp/space/scene.json' })),
      readJson: vi.fn().mockResolvedValue({ objects: [], assets: [] }),
      normalizeSpaceId,
      ensureSpaceWritable: vi.fn().mockResolvedValue({ allowEdits: true }),
      replaceSceneAndBroadcast,
      loadSpaceMeta: vi.fn().mockResolvedValue({ sceneVersion: 5 }),
      snapshotSpaceScene,
      httpRequest
    })
    return { router, replaceSceneAndBroadcast, snapshotSpaceScene, httpRequest }
  }

  const call = async (handler, req) => {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const next = vi.fn()
    await handler(req, { status, json }, next)
    return { status, json, next }
  }

  it('refuses a pull that does not say which local version it replaces', async () => {
    const { router, replaceSceneAndBroadcast, httpRequest } = setupPull()
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const { status, json } = await call(handler, { params: { spaceId: 'open-space' }, body: {} })

    expect(status).toHaveBeenCalledWith(428)
    // It says what the version IS, so the caller can re-issue deliberately
    // rather than guess.
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ localVersion: 5 }))
    expect(replaceSceneAndBroadcast).not.toHaveBeenCalled()
    expect(httpRequest).not.toHaveBeenCalled()
  })

  it('refuses a peer that cannot prove it read the scene verbatim', async () => {
    // An older server ignores ?verbatim=1 and returns its filtered, url-rewritten
    // rendering. The only difference is the absent missingAssetIds key, and
    // writing that response back is what erases upstream manifest entries.
    const httpRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => ({ scene: { objects: [], assets: [] }, version: 3 }),
      text: ''
    })
    const { router, replaceSceneAndBroadcast, snapshotSpaceScene } = setupPull({ httpRequest })
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const { status } = await call(handler, { params: { spaceId: 'open-space' }, body: { expectedVersion: 5 } })

    expect(status).toHaveBeenCalledWith(502)
    expect(replaceSceneAndBroadcast).not.toHaveBeenCalled()
    expect(snapshotSpaceScene).not.toHaveBeenCalled()
  })

  it('reports a rejected push as a conflict, not as a bad network', async () => {
    // This was a 502 "Live server returned 409" — a lost update reading as a
    // network hiccup, which is the worst possible way to report it.
    const httpRequest = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, text: '',
        json: () => ({ scene: { objects: [], assets: [] }, version: 9, missingAssetIds: [] })
      })
      .mockResolvedValueOnce({
        ok: false, status: 409, text: '',
        json: () => ({ latestVersion: 11, pendingOps: [{ opId: 'theirs' }] })
      })
    const { router } = setupPull({ httpRequest })
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/push']

    const { status, json } = await call(handler, { params: { spaceId: 'open-space' }, body: {} })

    expect(status).toHaveBeenCalledWith(409)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ latestVersion: 11 }))
  })

  it('snapshots the local scene before a pull overwrites it', async () => {
    const httpRequest = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: '',
      json: () => ({ scene: { objects: [{ id: 'a' }], assets: [] }, version: 4, missingAssetIds: [] })
    })
    const { router, snapshotSpaceScene, replaceSceneAndBroadcast } = setupPull({ httpRequest })
    const [handler] = router.routes['post /api/sync/spaces/:spaceId/pull']

    const { json } = await call(handler, { params: { spaceId: 'open-space' }, body: { expectedVersion: 5 } })

    expect(snapshotSpaceScene).toHaveBeenCalledWith('open-space', { keep: 7 })
    expect(snapshotSpaceScene.mock.invocationCallOrder[0])
      .toBeLessThan(replaceSceneAndBroadcast.mock.invocationCallOrder[0])
    // And the response says where it went, so it is recoverable by a person.
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ snapshot: '/snapshots/open-space/stamp.json' }))
  })
})

