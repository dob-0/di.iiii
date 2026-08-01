// Open inscriptions — the br_id_ge "portal" write path: anonymous visitors
// append ONE sanitized text object to a space's scene ("who are you and what
// do you carry"). Registered BEFORE the /api auth gates (like open-call
// submissions) so no session or token is required.
//
// Safety model — append + self-unmake with proof (why this is not the
// generic ops route):
//  - opt-in per space: meta.openInscriptions (owner/admin PATCH) AND isPublic
//  - server-constructed ops only: `addObject` of a text object with an
//    `insc-` id, or `deleteObject` of such an object — never arbitrary ops
//  - self-unmake: creating an inscription returns a one-time raw `proof`;
//    only its sha256 (`proofHash`) is stored on the object (the scene is
//    publicly readable). DELETE succeeds only when sha256(proof) matches,
//    so a visitor can remove exactly the crossing they made, nothing else.
//    Pre-proof objects (no proofHash) can never be deleted this way.
//  - sanitized: control chars stripped, lengths capped, count capped
//  - rate-limited per client; allowEdits=false stays the owner's kill switch

const crypto = require('node:crypto')
const { createKeyedLock } = require('../asyncLock')

const NAME_MAX = 40
const WORD_MAX = 60
const FIELD_MAX = 999
const INSCRIPTION_COLOR = '#cdb98f' // digitalkar tuff

const cleanLine = (value, max) => String(value ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

// Same golden-angle spiral the rite uses for its field — the space and the
// rite place stone n in the same ring.
const spiralPosition = (index) => {
  const a = index * 2.399
  const r = 3 + index * 0.35
  return [Math.cos(a) * r, 1.4, Math.sin(a) * r]
}

const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex')

// Both sides are sha256 hex (fixed 32 bytes), so timingSafeEqual never throws
// on length and the comparison leaks nothing about where the mismatch is.
const proofMatches = (proof, proofHash) => {
  const candidate = Buffer.from(sha256Hex(proof), 'hex')
  const stored = Buffer.from(String(proofHash), 'hex')
  return stored.length === candidate.length && crypto.timingSafeEqual(candidate, stored)
}

function registerInscriptionRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene,
  broadcastLiveEvent,
  ensureSpaceScene,
  ensureSpaceWritable,
  getSpacePaths,
  inscriptionLimiter = (req, res, next) => next(),
  loadSpaceMeta,
  maxOpHistory,
  normalizeSpaceId,
  readJson,
  upsertSpaceMeta,
  writeJson,
  // Same per-space lock instance spaceRoutes.js uses for /ops and whole-scene
  // replaces (createKeyedLock() in asyncLock.js) -- previously this route
  // kept its own separate lock map, so an inscription write and a normal
  // op-write to the same space could race outside each other's mutex
  // (audit 2026-07-17). Falls back to a fresh per-registration lock only if
  // the caller doesn't inject one (e.g. an isolated test).
  withSpaceOpsLock = createKeyedLock()
}) {
  router.post('/api/spaces/:spaceId/inscriptions', inscriptionLimiter, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const meta = await loadSpaceMeta(spaceId)
      if (!meta) return res.status(404).json({ error: 'Space not found.' })
      if (!meta.openInscriptions || !meta.isPublic) {
        return res.status(403).json({ error: 'This space does not accept inscriptions.' })
      }
      await ensureSpaceWritable(spaceId) // allowEdits=false → 403 kill switch

      const name = cleanLine(req.body?.name, NAME_MAX) || '—'
      const word = cleanLine(req.body?.word, WORD_MAX)
      if (!word) return res.status(400).json({ error: 'An inscription needs a word.' })

      await ensureSpaceScene(spaceId)

      const result = await withSpaceOpsLock(spaceId, async () => {
        const { scenePath } = getSpacePaths(spaceId)
        const scene = await readJson(scenePath, blankScene)
        const existing = (scene.objects || []).filter((obj) => String(obj?.id || '').startsWith('insc-'))
        if (existing.length >= FIELD_MAX) {
          return { full: true }
        }

        // One-time proof of authorship: the raw proof goes back in this
        // response and is never stored or returned again — the scene is
        // publicly readable, so the object carries only the sha256.
        const proof = crypto.randomBytes(24).toString('base64url')
        const object = {
          id: `insc-${crypto.randomUUID()}`,
          proofHash: sha256Hex(proof),
          type: 'text-2d',
          data: `${name} · ${word}`,
          position: spiralPosition(existing.length),
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: INSCRIPTION_COLOR,
          isVisible: true,
          fontWeight: 'normal',
          fontStyle: 'normal'
        }
        const op = {
          opId: crypto.randomUUID(),
          clientId: 'vi.ritual',
          type: 'addObject',
          payload: { object }
        }

        // Re-read meta inside the lock — another inscription queued ahead of
        // this one may have already advanced sceneVersion.
        const freshMeta = await loadSpaceMeta(spaceId)
        const currentVersion = freshMeta?.sceneVersion || 0
        const versionedOp = { ...op, version: currentVersion + 1, timestamp: Date.now() }
        const updatedScene = applySceneOps(scene, [versionedOp])
        await writeJson(scenePath, updatedScene)
        await appendOpsHistory(spaceId, [versionedOp], maxOpHistory)
        await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: versionedOp.version })
        broadcastLiveEvent(spaceId, 'scene-op', { version: versionedOp.version, ops: [versionedOp] })

        return { id: object.id, total: existing.length + 1, proof }
      })

      if (result.full) {
        return res.status(409).json({ error: 'The field is full.' })
      }
      res.status(201).json({ ok: true, id: result.id, total: result.total, proof: result.proof })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/spaces/:spaceId/inscriptions/:id', inscriptionLimiter, async (req, res, next) => {
    try {
      const spaceId = normalizeSpaceId(req.params.spaceId)
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
      const id = String(req.params.id || '')
      if (!id.startsWith('insc-')) return res.status(400).json({ error: 'Invalid inscription id.' })
      const proof = req.body?.proof
      if (typeof proof !== 'string' || !proof) return res.status(400).json({ error: 'An unmaking needs its proof.' })

      const meta = await loadSpaceMeta(spaceId)
      if (!meta) return res.status(404).json({ error: 'Space not found.' })
      if (!meta.openInscriptions || !meta.isPublic) {
        return res.status(403).json({ error: 'This space does not accept inscriptions.' })
      }
      await ensureSpaceWritable(spaceId) // allowEdits=false → 403 kill switch

      await ensureSpaceScene(spaceId)

      const result = await withSpaceOpsLock(spaceId, async () => {
        const { scenePath } = getSpacePaths(spaceId)
        const scene = await readJson(scenePath, blankScene)
        const objects = scene.objects || []
        const target = objects.find((obj) => String(obj?.id || '') === id)
        if (!target) return { missing: true }
        if (!target.proofHash) return { legacy: true }
        if (!proofMatches(proof, target.proofHash)) return { denied: true }

        const op = {
          opId: crypto.randomUUID(),
          clientId: 'vi.ritual',
          type: 'deleteObject',
          payload: { objectId: id }
        }

        const freshMeta = await loadSpaceMeta(spaceId)
        const currentVersion = freshMeta?.sceneVersion || 0
        const versionedOp = { ...op, version: currentVersion + 1, timestamp: Date.now() }
        const updatedScene = applySceneOps(scene, [versionedOp])
        await writeJson(scenePath, updatedScene)
        await appendOpsHistory(spaceId, [versionedOp], maxOpHistory)
        await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: versionedOp.version })
        broadcastLiveEvent(spaceId, 'scene-op', { version: versionedOp.version, ops: [versionedOp] })

        const remaining = (updatedScene.objects || [])
          .filter((obj) => String(obj?.id || '').startsWith('insc-')).length
        return { id, total: remaining }
      })

      if (result.missing) return res.status(404).json({ error: 'No such inscription.' })
      if (result.legacy) {
        return res.status(403).json({ error: 'This crossing predates proof of authorship and cannot be unmade.' })
      }
      if (result.denied) return res.status(403).json({ error: 'The proof does not match this crossing.' })
      res.json({ ok: true, id: result.id, total: result.total })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerInscriptionRoutes }
