// Open inscriptions — the br_id_ge "portal" write path: anonymous visitors
// append ONE sanitized text object to a space's scene ("who are you and what
// do you carry"). Registered BEFORE the /api auth gates (like open-call
// submissions) so no session or token is required.
//
// Safety model (why this is not the generic ops route):
//  - opt-in per space: meta.openInscriptions (owner/admin PATCH) AND isPublic
//  - append-only: the server constructs the op itself — only `addObject`,
//    only a text object with an `insc-` id; nothing can be updated or deleted
//  - sanitized: control chars stripped, lengths capped, count capped
//  - rate-limited per client; allowEdits=false stays the owner's kill switch

const crypto = require('node:crypto')

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
  writeJson
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
      const { scenePath } = getSpacePaths(spaceId)
      const scene = await readJson(scenePath, blankScene)
      const existing = (scene.objects || []).filter((obj) => String(obj?.id || '').startsWith('insc-'))
      if (existing.length >= FIELD_MAX) {
        return res.status(409).json({ error: 'The field is full.' })
      }

      const object = {
        id: `insc-${crypto.randomUUID()}`,
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

      const currentVersion = meta.sceneVersion || 0
      const versionedOp = { ...op, version: currentVersion + 1, timestamp: Date.now() }
      const updatedScene = applySceneOps(scene, [versionedOp])
      await writeJson(scenePath, updatedScene)
      await appendOpsHistory(spaceId, [versionedOp], maxOpHistory)
      await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: versionedOp.version })
      broadcastLiveEvent(spaceId, 'scene-op', { version: versionedOp.version, ops: [versionedOp] })

      res.status(201).json({ ok: true, id: object.id, total: existing.length + 1 })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerInscriptionRoutes }
