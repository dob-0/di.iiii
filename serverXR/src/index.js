require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const morgan = require('morgan')
const multer = require('multer')
const path = require('node:path')
const crypto = require('node:crypto')
const {
  formatAuthScopeLabel,
  formatAuthRoleLabel,
  hasRequiredAuthRole,
  isAuthScopeAllowedForSpace,
  normalizeAuthRole,
  normalizeAuthScopeSpaces
} = require('./authAccess')
const { config, buildCorsOriginHandler } = require('./config')
const {
  createAuthSessionValue,
  readCookie,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  verifyAuthSessionValue
} = require('./authSession')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { initializeSocket } = require('./socketHandlers')
const { loadReleaseInfo } = require('./releaseInfo')
const { registerProjectRoutes } = require('./routes/projectRoutes')
const { registerSpaceRoutes } = require('./routes/spaceRoutes')
const { registerStatusRoutes } = require('./routes/statusRoutes')
const { createSpaceStore } = require('./spaceStore')
const { loadSharedModule } = require('./sharedRuntime')
const {
  defaultScene: BLANK_SCENE,
  applySceneOps
} = loadSharedModule('sceneSchema.cjs')
const {
  defaultProjectDocument: BLANK_PROJECT_DOCUMENT,
  normalizeProjectDocument,
  applyProjectOps
} = loadSharedModule('projectSchema.cjs')
const {
  appendProjectOps,
  buildProjectAssetMeta,
  deleteProject,
  ensureProject,
  findProjectById,
  getProjectPaths,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  normalizeProjectId,
  readProjectDocument,
  readProjectOps,
  removeProjectIndexEntriesForSpace,
  upsertProjectMeta,
  writeProjectDocument
} = require('./projectStore')

const PUBLIC_DIR = config.directories.publicDir
const SPACES_DIR = config.directories.spacesDir
const UPLOADS_DIR = config.directories.uploadsDir
const RECENT_LIMIT = 25
const DEFAULT_TTL_MS = config.defaultTtlMs
const MAX_OP_HISTORY = 500
const DEFAULT_SPACE_ID = 'main'
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'model/']
const ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'text/plain'
])
const ALLOWED_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.obj',
  '.mtl',
  '.stl',
  '.fbx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mov',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.zip',
  '.bin',
  '.hdr',
  '.exr'
])

const releaseInfo = loadReleaseInfo(config.directories.root)

const {
  appendOpsHistory,
  buildMeta,
  deleteSpace,
  ensureDefaultSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  getSpacePaths,
  hydrateSceneAssetManifest,
  isValidAssetId,
  listSpaces,
  loadSpaceMeta,
  normalizeSpaceId,
  pruneSpaces,
  readOpsHistory,
  saveSpaceMeta,
  serveAsset,
  spaceExists,
  upsertSpaceMeta,
  writeOpsHistory
} = createSpaceStore({
  spacesDir: SPACES_DIR,
  defaultSpaceId: DEFAULT_SPACE_ID,
  defaultTtlMs: DEFAULT_TTL_MS,
  blankScene: BLANK_SCENE
})

const isAllowedUpload = (file) => {
  const mime = (file?.mimetype || '').toLowerCase()
  const name = (file?.originalname || '').toLowerCase()
  const ext = path.extname(name)
  if (ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))) return true
  if (ALLOWED_MIME_TYPES.has(mime)) {
    if (mime === 'application/octet-stream' && ext) {
      return ALLOWED_EXTENSIONS.has(ext)
    }
    return true
  }
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true
  return false
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]+/gi, '_')}`)
  }),
  limits: {
    fileSize: config.maxUploadBytes
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedUpload(file)) {
      cb(null, true)
      return
    }
    cb(new Error('Unsupported asset type.'))
  }
})

async function initStorage() {
  await Promise.all([ensureDir(SPACES_DIR), ensureDir(UPLOADS_DIR)])
}

const app = express()
const startedAt = Date.now()
const recentEvents = []
const liveClients = new Map()
const projectLiveClients = new Map()

function pushEvent(type, details = {}) {
  recentEvents.unshift({ type, details, timestamp: new Date().toISOString() })
  if (recentEvents.length > RECENT_LIMIT) {
    recentEvents.pop()
  }
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

const getProjectLiveBucket = async (projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) return null
  const resolved = await findProjectById(SPACES_DIR, normalized)
  if (!resolved) return null
  let bucket = projectLiveClients.get(normalized)
  if (!bucket) {
    bucket = new Map()
    projectLiveClients.set(normalized, bucket)
  }
  return {
    normalized,
    bucket,
    project: resolved
  }
}

const broadcastProjectLiveEvent = async (projectId, eventName, payload, excludeId) => {
  const entry = await getProjectLiveBucket(projectId)
  if (!entry) return
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  entry.bucket.forEach((client, clientId) => {
    if (excludeId && clientId === excludeId) return
    try {
      client.res.write(data)
    } catch (error) {
      console.warn('Failed to write project SSE event', error)
      client.res.end()
      entry.bucket.delete(clientId)
    }
  })
}

app.use(cors({
  origin: buildCorsOriginHandler(config.corsOrigins),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'Accept', 'Authorization', 'X-Api-Key'],
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

const buildAuthState = ({
  authenticated = false,
  type = null,
  role = null,
  subject = null,
  label = null,
  spaces = undefined,
  session = null,
  reason = null
} = {}) => ({
  authenticated: Boolean(authenticated),
  type: type || null,
  role: normalizeAuthRole(role, null),
  subject: subject || null,
  label: label || null,
  spaces: normalizeAuthScopeSpaces(spaces, null),
  ...(session ? { session } : {}),
  ...(reason ? { reason } : {})
})

const readAuthToken = (req) => {
  const header = req.get('authorization')
  if (header) {
    const [scheme, value] = header.split(' ')
    if (scheme && value && scheme.toLowerCase() === 'bearer') {
      return value.trim()
    }
    return header.trim()
  }
  const apiKey = req.get('x-api-key')
  if (apiKey) return String(apiKey).trim()
  return null
}

const normalizeAuthToken = (value = '') => String(value || '').trim().replace(/^bearer\s+/i, '')

const readAuthSession = (req) => {
  const value = readCookie(req.get('cookie') || '', config.authSession.cookieName)
  const result = verifyAuthSessionValue(value, { secret: config.auth.sessionSecret })
  if (!result.valid) {
    return buildAuthState({ authenticated: false, type: 'session', reason: result.reason })
  }
  const role = normalizeAuthRole(result.session?.role, null)
  if (!role) {
    return buildAuthState({ authenticated: false, type: 'session', reason: 'legacy' })
  }
  return {
    ...buildAuthState({
      authenticated: true,
      type: 'session',
      role,
      subject: result.session?.subject,
      label: result.session?.label,
      spaces: result.session?.spaces,
      session: result.session
    }),
    session: result.session
  }
}

const getAuthState = (req) => {
  const token = normalizeAuthToken(readAuthToken(req))
  const identity = config.auth.resolveIdentity(token)
  if (identity) {
    return buildAuthState({
      authenticated: true,
      type: 'token',
      role: identity.role,
      subject: identity.subject,
      label: identity.label,
      spaces: identity.spaces
    })
  }
  return readAuthSession(req)
}

const getPublicAuthState = (req) => {
  if (!config.requireAuth) {
    return buildAuthState({
      authenticated: true,
      type: 'disabled',
      role: 'admin',
      subject: 'auth-disabled',
      label: 'Auth Disabled'
    })
  }
  return getAuthState(req)
}

const setAuthSessionCookie = (res, value) => {
  res.setHeader('Set-Cookie', serializeAuthSessionCookie(value, {
    name: config.authSession.cookieName,
    path: config.authSession.cookiePath,
    secure: config.authSession.cookieSecure,
    ttlMs: config.authSession.ttlMs
  }))
}

const clearAuthSessionCookie = (res) => {
  res.setHeader('Set-Cookie', serializeExpiredAuthSessionCookie({
    name: config.authSession.cookieName,
    path: config.authSession.cookiePath,
    secure: config.authSession.cookieSecure
  }))
}

router.get('/api/auth/session', (req, res) => {
  const state = req.authState || getPublicAuthState(req)
  res.json({
    requireAuth: config.requireAuth,
    authenticated: Boolean(state.authenticated),
    type: state.type || null,
    role: state.role || null,
    subject: state.subject || null,
    label: state.label || null,
    spaces: state.spaces,
    expiresAt: state.session?.expiresAt || null
  })
})

router.post('/api/auth/session', (req, res) => {
  if (!config.requireAuth) {
    clearAuthSessionCookie(res)
    res.json({
      requireAuth: false,
      authenticated: true,
      type: 'disabled',
      expiresAt: null
    })
    return
  }

  const token = normalizeAuthToken(req.body?.token)
  const identity = config.auth.resolveIdentity(token)
  if (!identity) {
    clearAuthSessionCookie(res)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const session = createAuthSessionValue({
    secret: config.auth.sessionSecret,
    ttlMs: config.authSession.ttlMs,
    session: {
      subject: identity.subject,
      label: identity.label,
      role: identity.role,
      spaces: identity.spaces
    }
  })
  setAuthSessionCookie(res, session.value)
  res.json({
    requireAuth: true,
    authenticated: true,
    type: 'session',
    role: identity.role,
    subject: identity.subject,
    label: identity.label,
    spaces: identity.spaces,
    expiresAt: session.expiresAt
  })
})

router.delete('/api/auth/session', (req, res) => {
  clearAuthSessionCookie(res)
  res.status(204).end()
})

router.use((req, res, next) => {
  req.authState = getPublicAuthState(req)
  next()
})

const sendRoleError = (res, status, requiredRole, currentRole = null, error = null) => {
  res.status(status).json({
    error: error || (status === 401 ? 'Unauthorized' : `${formatAuthRoleLabel(requiredRole)} role required.`),
    requiredRole,
    ...(currentRole ? { currentRole } : {})
  })
}

const sendScopeError = (res, status, {
  requiredSpaceId = null,
  allowedSpaces = null,
  error = null
} = {}) => {
  res.status(status).json({
    error: error || 'Space access denied.',
    ...(requiredSpaceId ? { requiredSpaceId } : {}),
    allowedSpaces,
    allowedSpaceLabel: formatAuthScopeLabel(allowedSpaces)
  })
}

const requireWriteRole = (requiredRole = 'editor') => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (!config.requireAuth) return next()
  const resolvedRole = req.requiredWriteRole || requiredRole
  const state = req.authState || getPublicAuthState(req)
  if (!state.authenticated) {
    return sendRoleError(res, 401, resolvedRole, state.role)
  }
  if (hasRequiredAuthRole(state.role, resolvedRole)) {
    const requiredSpaceId = req.requiredSpaceId || null
    if (!isAuthScopeAllowedForSpace(state.spaces, requiredSpaceId)) {
      return sendScopeError(res, 403, {
        requiredSpaceId,
        allowedSpaces: state.spaces
      })
    }
    return next()
  }
  return sendRoleError(res, 403, resolvedRole, state.role)
}

const requireAdminWrite = requireWriteRole('admin')

router.use('/api/spaces', (req, res, next) => {
  if (req.method === 'POST' && (req.path === '/' || req.path === '')) {
    req.requiredWriteRole = 'admin'
  }
  next()
})

router.use('/api/spaces/:spaceId', (req, res, next) => {
  req.requiredSpaceId = normalizeSpaceId(req.params.spaceId) || null
  if (['PATCH', 'DELETE'].includes(req.method) && (req.path === '/' || req.path === '')) {
    req.requiredWriteRole = 'admin'
  }
  next()
})

router.use('/api/projects/:projectId', async (req, res, next) => {
  try {
    const project = await resolveProjectContext(req.params.projectId)
    req.requiredSpaceId = project?.spaceId || null
    if (req.method === 'DELETE' && (req.path === '/' || req.path === '')) {
      req.requiredWriteRole = 'admin'
    }
    next()
  } catch (error) {
    next(error)
  }
})

router.use('/api', requireWriteRole('editor'))

const resolveProjectContext = async (projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) {
    return null
  }
  return findProjectById(SPACES_DIR, normalized)
}

registerStatusRoutes(router, {
  recentEvents,
  releaseInfo,
  startedAt
})

registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene: BLANK_SCENE,
  broadcastLiveEvent,
  buildMeta,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  getLiveBucket,
  getSpacePaths,
  hydrateSceneAssetManifest,
  isValidAssetId,
  loadSpaceMeta,
  listSpaces,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectId,
  normalizeSpaceId,
  requireAdminWrite,
  onDeleteSpace: async (spaceId) => removeProjectIndexEntriesForSpace(SPACES_DIR, spaceId),
  readJson,
  readOpsHistory,
  saveSpaceMeta,
  serveAsset,
  spacesDir: SPACES_DIR,
  spaceExists,
  upsertSpaceMeta,
  upload,
  writeJson,
  writeOpsHistory
})

registerProjectRoutes(router, {
  appendProjectOps,
  applyProjectOps,
  blankProjectDocument: BLANK_PROJECT_DOCUMENT,
  broadcastProjectLiveEvent,
  buildProjectAssetMeta,
  deleteProjectWithIndex: async (spaceId, projectId) => deleteProject(SPACES_DIR, spaceId, projectId),
  ensureProject,
  ensureSpaceWritable,
  getProjectLiveBucket,
  getProjectPaths,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectDocument,
  normalizeProjectId,
  normalizeSpaceId,
  readJson,
  readProjectDocument,
  readProjectOps,
  resolveProjectContext,
  spacesDir: SPACES_DIR,
  spaceExists,
  upload,
  upsertProjectMeta,
  writeJson,
  writeProjectDocument
})

const mountTargets = new Set([config.mountPath])
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
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Uploaded file is too large.' })
    return
  }
  if (err?.message === 'Unsupported asset type.') {
    res.status(400).json({ error: err.message })
    return
  }
  res.status(err?.status || 500).json({ error: err.message || 'Server error' })
})

const PORT = config.port

initStorage()
  .then(async () => {
    await ensureDefaultSpace()
    pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    setInterval(() => {
      pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    }, 1000 * 60 * 30)

    const httpServer = http.createServer(app)

    initializeSocket(httpServer, {
      ...config,
      canEditSpace: async (spaceId) => {
        const normalized = normalizeSpaceId(spaceId)
        if (!normalized) return false
        const meta = await loadSpaceMeta(normalized)
        return meta?.allowEdits !== false
      },
      resolveProjectContext: async (projectId) => {
        return findProjectById(SPACES_DIR, projectId)
      }
    })
    console.log('[Socket.IO] Initialized for real-time collaboration')

    httpServer.listen(PORT, () => {
      pushEvent('server-started', {
        port: PORT,
        node: process.version,
        releaseId: releaseInfo.releaseId,
        deployEnv: releaseInfo.deployEnv
      })
      console.log(`Server running. Listening on: ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize storage', error)
    process.exit(1)
  })
