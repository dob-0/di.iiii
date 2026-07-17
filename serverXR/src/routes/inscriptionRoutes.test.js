import { describe, expect, it, vi } from 'vitest'
import { registerInscriptionRoutes } from './inscriptionRoutes.js'
import { createKeyedLock } from '../asyncLock.js'

function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return { routes, get: record('get'), post: record('post'), use: () => {} }
}

const setup = (withSpaceOpsLock) => {
  const router = makeFakeRouter()
  registerInscriptionRoutes(router, {
    appendOpsHistory: vi.fn(),
    applySceneOps: vi.fn((scene, ops) => ({ ...scene, objects: [...(scene.objects || []), ops[0].payload.object] })),
    blankScene: { objects: [] },
    broadcastLiveEvent: vi.fn(),
    ensureSpaceScene: vi.fn(),
    ensureSpaceWritable: vi.fn().mockResolvedValue({ allowEdits: true }),
    getSpacePaths: vi.fn(() => ({ scenePath: '/tmp/scene.json' })),
    loadSpaceMeta: vi.fn().mockResolvedValue({ openInscriptions: true, isPublic: true, sceneVersion: 0 }),
    maxOpHistory: 500,
    normalizeSpaceId: (id) => id,
    readJson: vi.fn().mockResolvedValue({ objects: [] }),
    upsertSpaceMeta: vi.fn().mockResolvedValue({}),
    writeJson: vi.fn().mockResolvedValue(undefined),
    ...(withSpaceOpsLock ? { withSpaceOpsLock } : {})
  })
  return router
}

const makeReqRes = (body) => ({
  req: { params: { spaceId: 'open' }, body },
  res: { json: vi.fn(), status: vi.fn(function status() { return this }) },
  next: vi.fn()
})

describe('inscriptionRoutes uses an injected shared lock, not its own separate one', () => {
  it('accepts an externally-provided withSpaceOpsLock and actually calls through it', async () => {
    const withSpaceOpsLock = vi.fn((spaceId, fn) => fn())
    const router = setup(withSpaceOpsLock)
    const handlers = router.routes['post /api/spaces/:spaceId/inscriptions']
    const handler = handlers[handlers.length - 1]
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello' })

    await handler(req, res, next)

    expect(withSpaceOpsLock).toHaveBeenCalledWith('open', expect.any(Function))
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  // Regression test for the 2026-07-17 audit: inscriptions used to maintain
  // their own separate lock map (`spaceWriteLocks`), independent from
  // spaceRoutes.js's `withSpaceOpsLock` -- so a normal /ops write and an
  // inscription write to the same space could interleave their read-modify-
  // write of scene.json instead of serializing. Proving real serialization:
  // hold the SAME lock instance open from an unrelated caller (standing in
  // for a concurrent /ops write) and confirm the inscription's callback
  // doesn't run until that first holder releases it.
  it('genuinely serializes against a concurrent caller sharing the same lock instance', async () => {
    const sharedLock = createKeyedLock()
    const order = []
    let releaseFirstHolder
    const firstHolderStarted = new Promise((resolveStarted) => {
      sharedLock('open', () => {
        order.push('first-holder-start')
        resolveStarted()
        return new Promise((resolve) => { releaseFirstHolder = resolve })
      })
    })

    const router = setup(sharedLock)
    const handlers = router.routes['post /api/spaces/:spaceId/inscriptions']
    const handler = handlers[handlers.length - 1]
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello' })

    await firstHolderStarted
    const inscriptionDone = handler(req, res, next).then(() => order.push('inscription-done'))

    // Give the event loop a beat -- if the bug were present (separate lock
    // maps), the inscription handler would already be done here.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['first-holder-start'])

    releaseFirstHolder()
    await inscriptionDone
    expect(order).toEqual(['first-holder-start', 'inscription-done'])
  })
})
