import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { registerInscriptionRoutes } from './inscriptionRoutes.js'
import { createKeyedLock } from '../asyncLock.js'

function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return {
    routes,
    get: record('get'),
    post: record('post'),
    put: record('put'),
    delete: record('delete'),
    use: () => {}
  }
}

const setup = (withSpaceOpsLock, overrides = {}) => {
  const router = makeFakeRouter()
  const deps = {
    appendOpsHistory: vi.fn(),
    applySceneOps: vi.fn((scene, ops) => {
      const op = ops[0]
      if (op.type === 'deleteObject') {
        return { ...scene, objects: (scene.objects || []).filter((obj) => obj.id !== op.payload.objectId) }
      }
      if (op.type === 'updateObject') {
        return {
          ...scene,
          objects: (scene.objects || []).map((obj) => (
            obj.id === op.payload.objectId ? { ...obj, ...op.payload.patch } : obj
          ))
        }
      }
      return { ...scene, objects: [...(scene.objects || []), op.payload.object] }
    }),
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
    ...(withSpaceOpsLock ? { withSpaceOpsLock } : {}),
    ...overrides
  }
  registerInscriptionRoutes(router, deps)
  return { router, deps }
}

const makeReqRes = (body, params = {}) => ({
  req: { params: { spaceId: 'open', ...params }, body },
  res: {
    json: vi.fn(),
    statusCode: null,
    status: vi.fn(function status(code) { this.statusCode = code; return this })
  },
  next: vi.fn()
})

const lastHandler = (router, key) => {
  const handlers = router.routes[key]
  return handlers[handlers.length - 1]
}

describe('inscriptionRoutes uses an injected shared lock, not its own separate one', () => {
  it('accepts an externally-provided withSpaceOpsLock and actually calls through it', async () => {
    const withSpaceOpsLock = vi.fn((spaceId, fn) => fn())
    const { router } = setup(withSpaceOpsLock)
    const handler = lastHandler(router, 'post /api/spaces/:spaceId/inscriptions')
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

    const { router } = setup(sharedLock)
    const handler = lastHandler(router, 'post /api/spaces/:spaceId/inscriptions')
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

describe('proof of authorship + self-unmake', () => {
  const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex')

  const createOne = async () => {
    const ctx = setup()
    const post = lastHandler(ctx.router, 'post /api/spaces/:spaceId/inscriptions')
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello' })
    await post(req, res, next)
    const body = res.json.mock.calls[0][0]
    const storedScene = ctx.deps.writeJson.mock.calls[0][1]
    const storedObject = storedScene.objects.find((obj) => obj.id === body.id)
    return { ctx, body, storedObject }
  }

  it('returns a one-time raw proof on create and stores only its sha256 on the object', async () => {
    const { body, storedObject } = await createOne()
    expect(typeof body.proof).toBe('string')
    expect(body.proof.length).toBeGreaterThanOrEqual(24)
    expect(storedObject.proofHash).toBe(sha256Hex(body.proof))
    // never the raw proof on the publicly readable object
    expect(JSON.stringify(storedObject)).not.toContain(body.proof)
  })

  const setupDelete = (sceneObjects, metaVersion = 1) => {
    const ctx = setup(undefined, {
      readJson: vi.fn().mockResolvedValue({ objects: sceneObjects }),
      loadSpaceMeta: vi.fn().mockResolvedValue({ openInscriptions: true, isPublic: true, sceneVersion: metaVersion })
    })
    return { ctx, del: lastHandler(ctx.router, 'delete /api/spaces/:spaceId/inscriptions/:id') }
  }

  it('deletes the object and bumps sceneVersion when the proof matches', async () => {
    const proof = 'the-raw-proof'
    const stone = { id: 'insc-abc', type: 'text-2d', proofHash: sha256Hex(proof) }
    const { ctx, del } = setupDelete([stone], 4)
    const { req, res, next } = makeReqRes({ proof }, { id: 'insc-abc' })

    await del(req, res, next)

    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'insc-abc', total: 0 })
    const writtenScene = ctx.deps.writeJson.mock.calls[0][1]
    expect(writtenScene.objects).toEqual([])
    const [op] = ctx.deps.appendOpsHistory.mock.calls[0][1]
    expect(op.type).toBe('deleteObject')
    expect(op.payload).toEqual({ objectId: 'insc-abc' })
    expect(op.version).toBe(5)
    expect(ctx.deps.upsertSpaceMeta).toHaveBeenCalledWith('open', { touch: true, sceneVersion: 5 })
    expect(ctx.deps.broadcastLiveEvent).toHaveBeenCalledWith('open', 'scene-op', expect.objectContaining({ version: 5 }))
  })

  it('403s on a wrong proof without touching the scene', async () => {
    const stone = { id: 'insc-abc', type: 'text-2d', proofHash: sha256Hex('right') }
    const { ctx, del } = setupDelete([stone])
    const { req, res, next } = makeReqRes({ proof: 'wrong' }, { id: 'insc-abc' })

    await del(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(ctx.deps.writeJson).not.toHaveBeenCalled()
  })

  it('403s with the distinct legacy message when the object predates proofHash', async () => {
    const stone = { id: 'insc-legacy', type: 'text-2d' }
    const { ctx, del } = setupDelete([stone])
    const { req, res, next } = makeReqRes({ proof: 'anything' }, { id: 'insc-legacy' })

    await del(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'This crossing predates proof of authorship and cannot be unmade.'
    })
    expect(ctx.deps.writeJson).not.toHaveBeenCalled()
  })

  it('404s on an unknown id', async () => {
    const { del } = setupDelete([])
    const { req, res, next } = makeReqRes({ proof: 'anything' }, { id: 'insc-nope' })
    await del(req, res, next)
    expect(res.statusCode).toBe(404)
  })

  it('400s on a non-inscription id or a missing proof', async () => {
    const { del } = setupDelete([])

    const bad = makeReqRes({ proof: 'x' }, { id: 'not-an-inscription' })
    await del(bad.req, bad.res, bad.next)
    expect(bad.res.statusCode).toBe(400)

    const noProof = makeReqRes({}, { id: 'insc-abc' })
    await del(noProof.req, noProof.res, noProof.next)
    expect(noProof.res.statusCode).toBe(400)
  })
})

// ── THE MARK ──────────────────────────────────────────────────────────────
// The drawing a visitor actually made, as opposed to every other property of a
// core, which is measured or hashed. Two rules carry the whole design: a mark is
// validated by SHAPE and never parsed here, and a bad one can never cost anyone
// the crossing.
const GOOD_MARK = `m1.${'A'.repeat(64)}`
const MARK_POST = 'post /api/spaces/:spaceId/inscriptions'
const MARK_PUT = 'put /api/spaces/:spaceId/inscriptions/:id/mark'
const proofHashOf = (proof) => createHash('sha256').update(proof, 'utf8').digest('hex')

const sceneWith = (extra = {}) => ({
  objects: [{ id: 'insc-1', proofHash: proofHashOf('right'), data: 'Ada · hello', ...extra }]
})

describe('a crossing can carry the mark that was drawn for it', () => {
  it('stores a well-formed mark on the object', async () => {
    const { router, deps } = setup(vi.fn((spaceId, fn) => fn()))
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello', mark: GOOD_MARK })

    await lastHandler(router, MARK_POST)(req, res, next)

    const written = deps.writeJson.mock.calls[0][1]
    expect(written.objects[0].mark).toBe(GOOD_MARK)
  })

  it.each([
    ['a foreign prefix', 'm2.AAAAAAAAAAAAAAAA'],
    ['characters outside the alphabet', 'm1.<script>alert(1)</script>'],
    ['a url', 'm1.https://evil.example/x'],
    ['too short to be a drawing', 'm1.AAA'],
    ['longer than the cap', `m1.${'A'.repeat(4000)}`],
    ['not a string at all', { toString: () => GOOD_MARK }]
  ])('drops %s and still makes the crossing', async (_label, mark) => {
    const { router, deps } = setup(vi.fn((spaceId, fn) => fn()))
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello', mark })

    await lastHandler(router, MARK_POST)(req, res, next)

    // the drawing is refused; the bridge is not
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    expect(deps.writeJson.mock.calls[0][1].objects[0]).not.toHaveProperty('mark')
  })

  it('leaves the property off entirely when no mark was drawn', async () => {
    const { router, deps } = setup(vi.fn((spaceId, fn) => fn()))
    const { req, res, next } = makeReqRes({ name: 'Ada', word: 'hello' })

    await lastHandler(router, MARK_POST)(req, res, next)

    expect(deps.writeJson.mock.calls[0][1].objects[0]).not.toHaveProperty('mark')
  })
})

describe('a mark can be changed afterwards, by exactly the person who made it', () => {
  const putSetup = (scene = sceneWith()) => setup(
    vi.fn((spaceId, fn) => fn()),
    { readJson: vi.fn().mockResolvedValue(scene) }
  )

  it('writes the new mark when the proof matches', async () => {
    const { router, deps } = putSetup()
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'insc-1' })
    expect(deps.writeJson.mock.calls[0][1].objects[0].mark).toBe(GOOD_MARK)
  })

  it('touches nothing but the mark', async () => {
    const { router, deps } = putSetup()
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    const op = deps.appendOpsHistory.mock.calls[0][1][0]
    expect(op.type).toBe('updateObject')
    expect(Object.keys(op.payload.patch)).toEqual(['mark'])
    expect(deps.writeJson.mock.calls[0][1].objects[0].data).toBe('Ada · hello')
  })

  it('refuses a proof that does not match', async () => {
    const { router, deps } = putSetup()
    const { req, res, next } = makeReqRes({ proof: 'wrong', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(deps.writeJson).not.toHaveBeenCalled()
  })

  it('refuses a crossing made before proofs existed', async () => {
    const { router, deps } = putSetup({ objects: [{ id: 'insc-1', data: 'Ada · hello' }] })
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(deps.writeJson).not.toHaveBeenCalled()
  })

  it('refuses an id that is not an inscription at all', async () => {
    const { router, deps } = putSetup()
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'obj-someone-elses' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.statusCode).toBe(400)
    expect(deps.writeJson).not.toHaveBeenCalled()
  })

  it('refuses a malformed mark rather than storing it', async () => {
    const { router, deps } = putSetup()
    const { req, res, next } = makeReqRes({ proof: 'right', mark: 'javascript:alert(1)' }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.statusCode).toBe(400)
    expect(deps.writeJson).not.toHaveBeenCalled()
  })

  it('refuses when the space does not accept inscriptions', async () => {
    const { router, deps } = setup(
      vi.fn((spaceId, fn) => fn()),
      {
        readJson: vi.fn().mockResolvedValue(sceneWith()),
        loadSpaceMeta: vi.fn().mockResolvedValue({ openInscriptions: false, isPublic: true })
      }
    )
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(deps.writeJson).not.toHaveBeenCalled()
  })

  it('takes the same per-space lock the other writers take', async () => {
    const withSpaceOpsLock = vi.fn((spaceId, fn) => fn())
    const { router } = setup(withSpaceOpsLock, { readJson: vi.fn().mockResolvedValue(sceneWith()) })
    const { req, res, next } = makeReqRes({ proof: 'right', mark: GOOD_MARK }, { id: 'insc-1' })

    await lastHandler(router, MARK_PUT)(req, res, next)

    expect(withSpaceOpsLock).toHaveBeenCalledWith('open', expect.any(Function))
  })
})

// ── the tunnel ────────────────────────────────────────────────────────────
const TUNNEL_POST = 'post /api/spaces/:spaceId/inscriptions/:id/tunnel'
const SECRET = 'a-shared-secret-with-di-bo'
const REAL_INSC = 'insc-a012122a-cbfa-4155-84e1-69d0a532c251'
const tunnelScene = () => ({
  objects: [{ id: REAL_INSC, proofHash: proofHashOf('right'), data: 'YN · skin' }]
})
const tunnelSetup = (overrides = {}) => setup(vi.fn((spaceId, fn) => fn()), {
  readJson: vi.fn().mockResolvedValue(tunnelScene()),
  tunnelSecret: SECRET,
  ...overrides
})

describe('the tunnel mint', () => {
  it('hands back a link for the person who can prove the crossing', async () => {
    const { router } = tunnelSetup()
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    const body = res.json.mock.calls[0][0]
    expect(body.ok).toBe(true)
    expect(body.url).toBe(`https://t.me/diiii111bot?start=${body.token}`)
    expect(body.expiresAt).toBeGreaterThan(Date.now())
    // the token really names THIS crossing, decoded the way di.bo decodes it
    const raw = Buffer.from(body.token, 'base64url')
    const hex = raw.subarray(1, 17).toString('hex')
    expect(`insc-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`)
      .toBe(REAL_INSC)
  })

  // The route is INERT without the secret, and inert as a 404: a switch that is
  // off should look exactly like a feature that was never built, and say
  // nothing about this server's configuration. di.bo's half returns early on
  // the same condition, so the tunnel is never half-on.
  it('does not exist at all until the secret does', async () => {
    const { router } = tunnelSetup({ tunnelSecret: '' })
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found.' })
  })

  it('refuses a proof that does not match', async () => {
    const { router } = tunnelSetup()
    const { req, res, next } = makeReqRes({ proof: 'wrong' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(403)
  })

  // The field's scene is world-readable, so every insc- id is public. Without a
  // proof the id alone must buy nothing at all — this is the whole reason the
  // link is minted here rather than composed in the page.
  it('refuses a request carrying only the public id', async () => {
    const { router } = tunnelSetup()
    const { req, res, next } = makeReqRes({}, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(400)
  })

  // A crossing that predates proof can never be unmade; it must not be
  // tunnellable either, or the one crossing nobody can prove is the one
  // anybody can claim.
  it('refuses a crossing that has no proof of authorship', async () => {
    const { router } = tunnelSetup({
      readJson: vi.fn().mockResolvedValue({ objects: [{ id: REAL_INSC, data: 'old · one' }] })
    })
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(403)
    // Assert WHICH 403. Without this the test passed even with the proofHash
    // check deleted: proofMatches(proof, undefined) compares against a garbage
    // buffer, returns false, and answers 403 from the next branch down. A
    // status code alone cannot tell a guard from its neighbour, and this one
    // guards the crossing nobody can prove — the one anybody could claim.
    expect(res.json).toHaveBeenCalledWith({
      error: 'This crossing predates proof of authorship and cannot open a tunnel.'
    })
  })

  it('refuses a crossing that is not in the field', async () => {
    const { router } = tunnelSetup({ readJson: vi.fn().mockResolvedValue({ objects: [] }) })
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(404)
  })

  // Minting a link changes nothing about the field, so it must not touch it.
  it('writes nothing — no op, no scene, no history', async () => {
    const { router, deps } = tunnelSetup()
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(deps.writeJson).not.toHaveBeenCalled()
    expect(deps.appendOpsHistory).not.toHaveBeenCalled()
    expect(deps.broadcastLiveEvent).not.toHaveBeenCalled()
  })

  it('respects the space kill switch like every other inscription route', async () => {
    const { router } = tunnelSetup({
      loadSpaceMeta: vi.fn().mockResolvedValue({ openInscriptions: false, isPublic: true })
    })
    const { req, res, next } = makeReqRes({ proof: 'right' }, { id: REAL_INSC })

    await lastHandler(router, TUNNEL_POST)(req, res, next)

    expect(res.statusCode).toBe(403)
  })
})
