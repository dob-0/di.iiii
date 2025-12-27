require('dotenv').config()
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const multer = require('multer')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const { config } = require('./config')
const {
  defaultScene: BLANK_SCENE,
  generateObjectId
} = require('../../shared/sceneSchema.cjs')

const PUBLIC_DIR = config.directories.publicDir
const DATA_DIR = config.directories.dataDir
const SPACES_DIR = config.directories.spacesDir
const UPLOADS_DIR = config.directories.uploadsDir
const RECENT_LIMIT = 25
const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const ASSET_ID_REGEX = /^[a-f0-9-]{8,64}$/i
const DEFAULT_TTL_MS = config.defaultTtlMs
const MAX_OP_HISTORY = 500
const OPS_FILE_NAME = 'ops.json'

const applySceneOps = (scene, ops = []) => {
  if (!scene || typeof scene !== 'object') {
    scene = { ...BLANK_SCENE, objects: [] }
  }
  let nextScene = {
    ...scene,
    objects: Array.isArray(scene.objects) ? [...scene.objects] : []
  }

  const objectsById = new Map(nextScene.objects.map(obj => [obj.id, obj]))

  const applyPatch = (obj, patch = {}) => ({
    ...obj,
    ...patch
  })

  ops.forEach((op) => {
    const payload = op?.payload || {}
    switch (op?.type) {
      case 'addObject': {
        if (!payload.object) break
        const object = {
          ...payload.object,
          id: payload.object.id || generateObjectId()
        }
        objectsById.set(object.id, object)
        break
      }
      case 'updateObject': {
        const targetId = payload.objectId
        if (!targetId || !objectsById.has(targetId)) break
        const existing = objectsById.get(targetId)
        objectsById.set(targetId, applyPatch(existing, payload.patch || {}))
        break
      }
      case 'deleteObject': {
        const targetId = payload.objectId
        if (targetId) {
          objectsById.delete(targetId)
        }
        break
      }
      case 'setSceneSettings': {
        const allowed = ['backgroundColor', 'gridSize', 'isGridVisible', 'isGizmoVisible', 'isPerfVisible', 'ambientLight', 'directionalLight', 'transformSnaps']
        allowed.forEach((key) => {
          if (key in payload) {
            nextScene[key] = payload[key]
          }
        })
        break
      }
      case 'setView': {
        if (payload.savedView) {
          nextScene.savedView = {
            ...nextScene.savedView,
            ...payload.savedView
          }
        }
        if (payload.default3DView) {
          nextScene.default3DView = {
            ...nextScene.default3DView,
            ...payload.default3DView
          }
        }
        break
      }
      case 'replaceScene': {
        if (payload.scene && typeof payload.scene === 'object') {
          const replacement = payload.scene
          nextScene = {
            ...nextScene,
            ...replacement
          }
          const newObjects = Array.isArray(replacement.objects)
            ? replacement.objects.map(obj => ({
                ...obj,
                id: obj?.id || generateObjectId()
              }))
            : []
          objectsById.clear()
          newObjects.forEach(obj => objectsById.set(obj.id, obj))
        }
        break
      }
      default:
        break
    }
  })

  nextScene.objects = Array.from(objectsById.values())
  return nextScene
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]+/gi, '_')}`)
  })
})

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function initStorage() {
  await Promise.all([ensureDir(SPACES_DIR), ensureDir(UPLOADS_DIR)])
}

const mountPath = config.mountPath

const app = express()
const startedAt = Date.now()
const recentEvents = []
const liveClients = new Map()

function pushEvent(type, details = {}) {
  recentEvents.unshift({ type, details, timestamp: new Date().toISOString() })
  if (recentEvents.length > RECENT_LIMIT) {
    recentEvents.pop()
 }
}

const DEFAULT_SPACE_ID = 'main'

const safeSlug = (value = '') => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

const normalizeSpaceId = (value) => {
  const slug = safeSlug(value)
  if (!slug || !SLUG_REGEX.test(slug)) {
    return null
  }
  return slug
}

const getSpacePaths = (spaceId) => {
  const spaceDir = path.join(SPACES_DIR, spaceId)
  return {
    spaceDir,
    scenePath: path.join(spaceDir, 'scene.json'),
    assetsDir: path.join(spaceDir, 'assets'),
    metaPath: path.join(spaceDir, 'meta.json'),
    opsPath: path.join(spaceDir, OPS_FILE_NAME)
  }
}

const getOpsPath = (spaceId) => getSpacePaths(spaceId).opsPath

const readOpsHistory = async (spaceId) => {
  const { opsPath } = getSpacePaths(spaceId)
  return readJson(opsPath, [])
}

const writeOpsHistory = async (spaceId, ops) => {
  const { opsPath } = getSpacePaths(spaceId)
  await ensureDir(path.dirname(opsPath))
  await writeJson(opsPath, ops)
}

const appendOpsHistory = async (spaceId, newOps = []) => {
  if (!Array.isArray(newOps) || newOps.length === 0) return []
  const history = await readOpsHistory(spaceId)
  const combined = history.concat(newOps)
  const trimmed = combined.length > MAX_OP_HISTORY
    ? combined.slice(combined.length - MAX_OP_HISTORY)
    : combined
  await writeOpsHistory(spaceId, trimmed)
  return trimmed
}

const normalizeIncomingOps = (ops = []) => {
  if (!Array.isArray(ops)) return []
  return ops
    .map((op) => {
      if (!op || typeof op.type !== 'string') return null
      const normalizedOpId = (typeof op.opId === 'string' && op.opId.trim())
        ? op.opId.trim()
        : (crypto.randomUUID?.() || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
      return {
        opId: normalizedOpId,
        clientId: typeof op.clientId === 'string' ? op.clientId : null,
        type: op.type,
        payload: op.payload || {}
      }
    })
    .filter(Boolean)
}

const readJson = async (filePath, fallback = null) => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

const writeJson = (filePath, data) => fsp.writeFile(filePath, JSON.stringify(data, null, 2))

const spaceExists = async (spaceId) => {
  try {
    const { metaPath } = getSpacePaths(spaceId)
    await fsp.access(metaPath)
    return true
  } catch {
    return false
  }
}

const buildMeta = (spaceId, overrides = {}) => {
  const now = Date.now()
  return {
    id: spaceId,
    label: (overrides.label && String(overrides.label).trim()) || spaceId,
    permanent: Boolean(overrides.permanent),
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    lastTouchedAt: now,
    sceneVersion: Number.isFinite(overrides.sceneVersion) ? Number(overrides.sceneVersion) : 0
  }
}

const loadSpaceMeta = async (spaceId) => {
  const { metaPath } = getSpacePaths(spaceId)
  return readJson(metaPath)
}

const saveSpaceMeta = async (spaceId, meta) => {
  const { spaceDir, metaPath } = getSpacePaths(spaceId)
  await ensureDir(spaceDir)
  await writeJson(metaPath, meta)
}

const upsertSpaceMeta = async (spaceId, updates = {}) => {
  let meta = await loadSpaceMeta(spaceId)
  if (!meta) {
    meta = buildMeta(spaceId, updates)
  } else {
    meta = {
      ...meta,
      ...('label' in updates ? { label: updates.label } : {}),
      ...('permanent' in updates ? { permanent: Boolean(updates.permanent) } : {}),
      ...('sceneVersion' in updates ? { sceneVersion: Number.isFinite(Number(updates.sceneVersion)) ? Number(updates.sceneVersion) : (meta.sceneVersion || 0) } : {})
    }
    meta.updatedAt = Date.now()
  }
  if (updates.touch !== false) {
    meta.lastTouchedAt = Date.now()
  }
  await saveSpaceMeta(spaceId, meta)
  return meta
}

const ensureDefaultSpace = async () => {
  const id = normalizeSpaceId(DEFAULT_SPACE_ID) || DEFAULT_SPACE_ID
  const meta = await loadSpaceMeta(id)
  if (!meta) {
    await saveSpaceMeta(id, buildMeta(id, { label: 'Main Space', permanent: true }))
  }
  const { spaceDir, assetsDir } = getSpacePaths(id)
  await ensureDir(spaceDir)
  await ensureDir(assetsDir)
}

const ensureSpaceScene = async (spaceId) => {
  const { scenePath, assetsDir, opsPath } = getSpacePaths(spaceId)
  await ensureDir(path.dirname(scenePath))
  await ensureDir(assetsDir)
  try {
    await fsp.access(scenePath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeJson(scenePath, BLANK_SCENE)
    } else {
      throw error
    }
  }
  try {
    await fsp.access(opsPath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeJson(opsPath, [])
    } else {
      throw error
    }
  }
}

const listSpaces = async () => {
  await ensureDir(SPACES_DIR)
  const entries = await fsp.readdir(SPACES_DIR, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await loadSpaceMeta(entry.name)
    if (meta) {
      result.push(meta)
    }
  }
  return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

const deleteSpace = async (spaceId) => {
  const { spaceDir } = getSpacePaths(spaceId)
  await fsp.rm(spaceDir, { recursive: true, force: true })
}

const pruneSpaces = async () => {
  if (!DEFAULT_TTL_MS) return
  const cutoff = Date.now() - DEFAULT_TTL_MS
  const spaces = await listSpaces()
  const stale = spaces.filter(space => !space.permanent && (space.lastTouchedAt || space.updatedAt || space.createdAt || 0) < cutoff)
  await Promise.all(stale.map(space => deleteSpace(space.id)))
}

const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

const serveAsset = async (spaceId, assetId, res) => {
  const { assetsDir } = getSpacePaths(spaceId)
  const filePath = path.join(assetsDir, assetId)
  const metaPath = path.join(assetsDir, `${assetId}.json`)
  const meta = await readJson(metaPath, null)
  await fsp.access(filePath)
  res.setHeader('Content-Type', meta?.mimeType || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  const stream = fs.createReadStream(filePath)
  stream.on('error', (err) => {
    console.error(err)
    res.status(500).end('Failed to read asset')
  })
  stream.pipe(res)
}

const getLiveBucket = (spaceId) => {
  const normalized = normalizeSpaceId(spaceId)
  if (!normalized) return null
  let bucket = liveClients.get(normalized)
  if (!bucket) {
    bucket = new Map()
    liveClients.set(normalized, bucket)
  }
  return { normalized, bucket }
}

const broadcastLiveEvent = (spaceId, eventName, payload, excludeId) => {
  const entry = getLiveBucket(spaceId)
  if (!entry) return
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  entry.bucket.forEach((client, clientId) => {
    if (excludeId && clientId === excludeId) return
    try {
      client.res.write(data)
    } catch (error) {
      console.warn('Failed to write SSE event', error)
      client.res.end()
      entry.bucket.delete(clientId)
    }
  })
}

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}))
app.use(express.json({ limit: '10mb' }))
app.use(morgan('tiny'))
app.use((req, res, next) => {
  pushEvent('request', { method: req.method, url: req.url })
  next()
})

const router = express.Router()
router.use(express.static(PUBLIC_DIR))

router.get('/api/health', (req, res) => {
  const memory = process.memoryUsage()
  res.json({
    ok: true,
    nodeVersion: process.version,
    uptimeSeconds: process.uptime(),
    startedAt,
    timestamp: Date.now(),
    mode: process.env.NODE_ENV || 'production',
    port: process.env.PORT || 'unknown',
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed
    },
    host: {
      platform: process.platform,
      release: os.release(),
      cpus: os.cpus().length
    }
  })
})

router.get('/api/events', (req, res) => {
  res.json({ events: recentEvents })
})

router.get('/api/spaces', async (req, res, next) => {
  try {
    const spaces = await listSpaces()
    res.json({ spaces })
  } catch (error) {
    next(error)
  }
})

router.post('/api/spaces', async (req, res, next) => {
  try {
    const { label = '', slug, permanent = false } = req.body || {}
    const desired = slug || label || ''
    const spaceId = normalizeSpaceId(desired)
    if (!spaceId) {
      return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, or dashes (min 3 characters).' })
    }
    if (await spaceExists(spaceId)) {
      return res.status(409).json({ error: 'Space already exists.' })
    }
    const meta = buildMeta(spaceId, { label, permanent })
    await saveSpaceMeta(spaceId, meta)
    await ensureSpaceScene(spaceId)
    res.status(201).json({ space: meta })
  } catch (error) {
    next(error)
  }
})

router.patch('/api/spaces/:spaceId', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    if (!(await spaceExists(spaceId))) {
      return res.status(404).json({ error: 'Space not found.' })
    }
    const { label, permanent } = req.body || {}
    const meta = await upsertSpaceMeta(spaceId, {
      ...(label !== undefined ? { label } : {}),
      ...(permanent !== undefined ? { permanent } : {})
    })
    res.json({ space: meta })
  } catch (error) {
    next(error)
  }
})

router.delete('/api/spaces/:spaceId', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    if (!(await spaceExists(spaceId))) {
      return res.status(404).json({ error: 'Space not found.' })
    }
    await deleteSpace(spaceId)
    res.json({ ok: true, newVersion: nextVersion })
  } catch (error) {
    next(error)
  }
})

router.post('/api/spaces/:spaceId/touch', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    if (!(await spaceExists(spaceId))) {
      return res.status(404).json({ error: 'Space not found.' })
    }
    const meta = await upsertSpaceMeta(spaceId, { touch: true })
    res.json({ space: meta })
  } catch (error) {
    next(error)
  }
})

router.get('/api/spaces/:spaceId/scene', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    const { scenePath } = getSpacePaths(spaceId)
    await ensureSpaceScene(spaceId)
    const scene = await readJson(scenePath, BLANK_SCENE)
    const meta = await loadSpaceMeta(spaceId)
    res.json({
      scene,
      version: meta?.sceneVersion || 0
    })
  } catch (error) {
    next(error)
  }
})

router.get('/api/spaces/:spaceId/ops', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    const since = Number(req.query.since)
    const history = await readOpsHistory(spaceId)
    const meta = await loadSpaceMeta(spaceId)
    const latestVersion = meta?.sceneVersion || 0
    const filtered = Number.isFinite(since)
      ? history.filter(entry => (entry.version || 0) > since)
      : history
    res.json({
      ops: filtered,
      latestVersion
    })
  } catch (error) {
    next(error)
  }
})

router.post('/api/spaces/:spaceId/ops', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    const { baseVersion, ops } = req.body || {}
    const parsedBaseVersion = Number(baseVersion)
    if (!Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) {
      return res.status(400).json({ error: 'baseVersion must be an integer' })
    }
    const normalizedOps = normalizeIncomingOps(ops)
    if (!normalizedOps.length) {
      return res.status(400).json({ error: 'No operations provided.' })
    }

    await ensureSpaceScene(spaceId)
    const meta = await loadSpaceMeta(spaceId)
    const currentVersion = meta?.sceneVersion || 0
    if (parsedBaseVersion !== currentVersion) {
      const history = await readOpsHistory(spaceId)
      const pendingOps = history.filter(entry => (entry.version || 0) > parsedBaseVersion)
      return res.status(409).json({
        latestVersion: currentVersion,
        pendingOps
      })
    }

    const { scenePath } = getSpacePaths(spaceId)
    const scene = await readJson(scenePath, BLANK_SCENE)
    let nextVersion = currentVersion
    const timestamp = Date.now()
    const opsWithVersion = normalizedOps.map((op) => ({
      ...op,
      version: ++nextVersion,
      timestamp
    }))
    const updatedScene = applySceneOps(scene, opsWithVersion)
    await writeJson(scenePath, updatedScene)
    await appendOpsHistory(spaceId, opsWithVersion)
    await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
    broadcastLiveEvent(spaceId, 'scene-op', {
      version: nextVersion,
      ops: opsWithVersion
    })
    res.json({
      newVersion: nextVersion,
      ops: opsWithVersion
    })
  } catch (error) {
    next(error)
  }
})

router.put('/api/spaces/:spaceId/scene', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    const sceneData = req.body
    if (!sceneData || typeof sceneData !== 'object') {
      return res.status(400).json({ error: 'Scene payload required.' })
    }
    const { spaceDir, scenePath, assetsDir } = getSpacePaths(spaceId)
    await ensureDir(spaceDir)
    await ensureDir(assetsDir)
    await writeJson(scenePath, sceneData)
    const meta = await loadSpaceMeta(spaceId)
    const currentVersion = meta?.sceneVersion || 0
    const nextVersion = currentVersion + 1
    const resetOp = {
      opId: crypto.randomUUID?.() || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      clientId: 'server',
      type: 'replaceScene',
      payload: { scene: sceneData },
      version: nextVersion,
      timestamp: Date.now()
    }
    await writeOpsHistory(spaceId, [resetOp])
    await upsertSpaceMeta(spaceId, { touch: true, sceneVersion: nextVersion })
    broadcastLiveEvent(spaceId, 'scene-op', {
      version: nextVersion,
      ops: [resetOp]
    })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/api/spaces/:spaceId/assets', upload.single('asset'), async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
    if (!req.file) {
      return res.status(400).json({ error: 'Missing asset file.' })
    }
    const { assetsDir } = getSpacePaths(spaceId)
    await ensureDir(assetsDir)
    let assetId = ''
    if (req.body?.assetId) {
      const requested = String(req.body.assetId).trim()
      if (!isValidAssetId(requested)) {
        await fsp.rm(req.file.path, { force: true }).catch(() => {})
        return res.status(400).json({ error: 'Invalid asset id.' })
      }
      assetId = requested
    } else {
      assetId = crypto.randomUUID()
    }
    const finalPath = path.join(assetsDir, assetId)
    const metaPath = path.join(assetsDir, `${assetId}.json`)
    await fsp.rm(finalPath, { force: true })
    await fsp.rm(metaPath, { force: true })
    await fsp.rename(req.file.path, finalPath)
    const meta = {
      id: assetId,
      name: req.file.originalname || assetId,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size || 0,
      createdAt: Date.now()
    }
    await writeJson(metaPath, meta)
    await upsertSpaceMeta(spaceId, { touch: true })
    const url = `${req.baseUrl || ''}/api/spaces/${spaceId}/assets/${assetId}`
    res.json({
      assetId,
      mimeType: meta.mimeType,
      size: meta.size,
      url
    })
  } catch (error) {
    next(error)
  }
})

router.get('/api/spaces/:spaceId/assets/:assetId', async (req, res, next) => {
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId)
    const assetId = req.params.assetId
    if (!spaceId || !isValidAssetId(assetId)) {
      return res.status(400).json({ error: 'Invalid request.' })
    }
    await serveAsset(spaceId, assetId, res)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Asset not found.' })
    }
    next(error)
  }
})

router.get('/api/spaces/:spaceId/events', (req, res) => {
  const entry = getLiveBucket(req.params.spaceId)
  if (!entry) {
    res.status(400).end('Invalid space id')
    return
  }
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  const clientId = crypto.randomUUID()
  entry.bucket.set(clientId, { res })
  res.write(`event: ready\ndata: ${JSON.stringify({ clientId })}\n\n`)
  const keepAlive = setInterval(() => {
    try {
      res.write(':keep-alive\n\n')
    } catch {
      clearInterval(keepAlive)
    }
  }, 25000)
  req.on('close', () => {
    clearInterval(keepAlive)
    entry.bucket.delete(clientId)
  })
})

router.post('/api/spaces/:spaceId/live', (req, res) => {
  const entry = getLiveBucket(req.params.spaceId)
  if (!entry) {
    return res.status(400).json({ error: 'Invalid space id.' })
  }
  const body = req.body || {}
  if (!body.payload && !body.cursor) {
    return res.status(400).json({ error: 'payload or cursor required' })
  }
  if (body.payload) {
    broadcastLiveEvent(entry.normalized, 'scene-patch', { payload: body.payload }, body.clientId)
  }
  if (body.cursor) {
    broadcastLiveEvent(entry.normalized, 'cursor-update', { cursor: body.cursor, clientId: body.clientId }, body.clientId)
  }
  res.json({ ok: true })
})

const mountTargets = new Set([mountPath])
if (!mountTargets.has('/serverXR')) {
  mountTargets.add('/serverXR')
}
mountTargets.forEach((targetPath) => {
  const normalizedTarget = targetPath || '/'
  app.use(normalizedTarget, router)
})

app.use((err, req, res, next) => {
  pushEvent('error', { message: err.message })
  console.error(err)
  res.status(500).json({ error: err.message || 'Server error' })
})

const PORT = config.port

initStorage()
  .then(() => {
    ensureDefaultSpace().catch((error) => console.warn('Failed to ensure default space', error))
    pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    setInterval(() => {
      pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    }, 1000 * 60 * 30) // every 30 minutes
    app.listen(PORT, () => {
      pushEvent('server-started', { port: PORT, node: process.version })
      console.log(`Server running. Listening on: ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize storage', error)
    process.exit(1)
  })
